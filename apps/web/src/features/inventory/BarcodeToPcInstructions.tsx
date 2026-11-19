export function BarcodeToPcInstructions(){
 return <details open className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
  <summary className="cursor-pointer font-semibold">How to start scanning with Barcode to PC</summary>
  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
   <li><strong>Open the receiver on your PC.</strong> Open Barcode to PC server and sign in. For another PC, <a href="https://barcodetopc.com/download/" target="_blank" rel="noreferrer" className="underline">install the official receiver</a> first.</li>
   <li><strong>Connect your phone.</strong> Connect both devices to the same Wi-Fi. Open Barcode to PC on the phone and scan the connection QR code shown by the PC receiver.</li>
   <li><strong>Check the output.</strong> In receiver settings, keep keyboard emulation enabled. Set the output template to BARCODE followed by ENTER. <a href="https://docs.barcodetopc.com/output-template/how-it-works/" target="_blank" rel="noreferrer" className="underline">See the vendor setup guide</a>.</li>
   <li><strong>Start inventory.</strong> Enter a count name, choose Books, Research or both, choose the scope, then click Start inventory now. To continue later, select the count under Saved counts.</li>
   <li><strong>Choose location and condition.</strong> Select the location being checked and the item's observed condition. That condition stays selected for the next items; change it whenever needed.</li>
   <li><strong>Focus the scan box on this PC.</strong> Click Scan barcode or enter accession. Keep this browser window active, then scan the physical copy label using the phone camera. The phone sends the code and Enter records the item.</li>
   <li><strong>Check the result, then continue.</strong> Wait for Recorded before scanning the next item. Scans save automatically. Duplicate scans count once. Unknown codes and other exceptions appear in Review findings.</li>
   <li><strong>Finish with a review.</strong> Click Review and finish, check the results, enter a follow-up note and save the report. Download CSV or PDF when needed. The count records observations; it does not automatically mark unchecked items lost.</li>
  </ol>
  <p className="mt-3 text-sm">Use the unique library copy label. A publisher ISBN identifies a title and cannot identify one physical copy.</p>
  <p className="mt-2 text-sm">If nothing appears, check the phone connection, keyboard emulation and scan-box focus. If the code appears without saving, add ENTER to the output template or click Record item.</p>
 </details>
}
