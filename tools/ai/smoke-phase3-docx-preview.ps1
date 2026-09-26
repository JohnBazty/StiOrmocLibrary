param(
  [Parameter(Mandatory=$true)][string]$SourceDocx,
  [Parameter(Mandatory=$true)][string]$DeploymentId
)
$ErrorActionPreference = 'Stop'
$name = 'phase3-docx-smoke-' + [guid]::NewGuid().ToString('N')
$source = Join-Path $env:TEMP ($name + '.docx')
$download = Join-Path $env:TEMP ($name + '.pdf')
Copy-Item -LiteralPath $SourceDocx -Destination $source
$env:PHASE3_DOCX_SMOKE_NAME = $name + '.pdf'

function TokenFor([string]$role) {
  $env:PHASE3_TEST_ROLE = $role
  $token = node --input-type=module -e 'import {db} from "./apps/api/src/config/db.js"; import {env} from "./apps/api/src/config/env.js"; import jwt from "jsonwebtoken"; const role=process.env.PHASE3_TEST_ROLE; const [r]=await db.execute("SELECT a.account_id,a.school_id FROM accounts a JOIN users u ON u.user_id=a.user_id WHERE a.role=? AND a.account_status=''Active'' LIMIT 1",[role]); const a=r[0]; if(!a)throw Error("No linked active account for "+role); console.log(jwt.sign({accountId:a.account_id,userId:a.account_id,schoolId:a.school_id,role},env.jwt.secret,{algorithm:"HS256",issuer:env.jwt.issuer,audience:env.jwt.audience,subject:String(a.account_id),expiresIn:240})); await db.end();'
  if ($LASTEXITCODE -ne 0) { throw "Could not create a $role test token" }
  return $token
}

function CallApi([string]$path, [string]$token, [string[]]$curlArgs) {
  $body = npx --yes vercel curl $path --deployment $DeploymentId --scope team_wAUPvzzbz6oyARTA04OLQyH2 -- --silent --show-error --max-time 90 --header "Authorization: Bearer $token" @curlArgs
  if ($LASTEXITCODE -ne 0) { throw "Request failed: $path" }
  try { return ($body | ConvertFrom-Json) } catch { throw "Non-JSON response from $path`: $body" }
}

try {
  $student = TokenFor 'Student'
  $admin = TokenFor 'Admin'
  $form = @('--request','POST','--form',"document=@$source;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document",'--form','number_of_copies=2','--form','print_type=Monochrome','--form','paper_size=A4')
  $quote = CallApi '/api/v1/printing/quote' $student $form
  if (-not $quote.success) { throw "DOCX quote failed: $($quote.code) $($quote.message)" }
  $submitForm = $form + @('--form',"page_count=$($quote.data.page_count)",'--form',"document_sha256=$($quote.data.document_sha256)",'--form',"quoted_cost=$($quote.data.calculated_cost)")
  $submit = CallApi '/api/v1/printing/requests' $student $submitForm
  if (-not $submit.success) { throw "DOCX submission failed: $($submit.code) $($submit.message)" }
  $requestId = [int]$submit.data.request_id
  if (-not $requestId) { throw 'Submission did not return a request ID' }
  npx --yes vercel curl "/api/v1/admin/printing/requests/$requestId/document" --deployment $DeploymentId --scope team_wAUPvzzbz6oyARTA04OLQyH2 -- --silent --show-error --max-time 30 --header "Authorization: Bearer $admin" --output $download | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Admin document download failed' }
  $pages = node --input-type=module -e 'import {readFileSync} from "node:fs"; import {PDFDocument} from "pdf-lib"; const pdf=await PDFDocument.load(readFileSync(process.argv[1])); console.log(pdf.getPageCount())' $download
  if ([int]$pages -ne [int]$quote.data.page_count) { throw 'Stored PDF page count differs from quote' }
  Write-Output "PASS: DOCX quoted, submitted, and downloaded as $pages-page PDF; $($quote.data.total_sheets) sheets at PHP $($quote.data.calculated_cost)."
} finally {
  node --input-type=module -e 'import {db} from "./apps/api/src/config/db.js"; import {env} from "./apps/api/src/config/env.js"; import {createClient} from "@supabase/supabase-js"; const [rows]=await db.execute("SELECT request_id,file_path FROM print_requests WHERE file_name=?",[process.env.PHASE3_DOCX_SMOKE_NAME]); const c=createClient(env.supabase.url,env.supabase.secretKey); for(const row of rows){await db.execute("DELETE FROM print_file_download_audit WHERE request_id=?",[row.request_id]); await db.execute("DELETE FROM print_status_history WHERE request_id=?",[row.request_id]); await db.execute("DELETE FROM print_requests WHERE request_id=?",[row.request_id]); const path=String(row.file_path??""); if(path.startsWith("supabase://printing-documents/")){const x=await c.storage.from("printing-documents").remove([path.slice("supabase://printing-documents/".length)]); if(x.error)throw Error("Storage cleanup failed")}} console.log("Temporary print requests removed:",rows.length); await db.end();'
  $cleanupFailed = $LASTEXITCODE -ne 0
  Remove-Item -LiteralPath $source -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $download -ErrorAction SilentlyContinue
  if ($cleanupFailed) { throw 'Temporary request cleanup failed' }
}
