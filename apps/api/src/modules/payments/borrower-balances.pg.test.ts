import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { toPgPlaceholders } from '../../config/sql.js'
import { borrowerBalances } from './borrower-balances.ts'

test('Postgres standing combines issued cash, adjustments and matching online credits without writes',async()=>{
  const pg=new PGlite()
  try{
    await pg.exec(`
      CREATE TABLE fines(fine_id int,user_id int,fine_amount numeric(10,2),payment_status text);
      CREATE TABLE lost_book_reports(lost_book_report_id int,user_id int,replacement_charge numeric(10,2),report_status text,payment_status text);
      CREATE TABLE fine_payment_receipts(fine_payment_receipt_id int,receipt_status text);
      CREATE TABLE fine_payment_allocations(fine_id int,lost_book_report_id int,fine_payment_receipt_id int,amount_allocated numeric(10,2));
      CREATE TABLE fine_adjustments(fine_id int,amount_adjusted numeric(10,2));
      INSERT INTO fines VALUES (1,7,190,'Partially Paid'),(2,7,190,'Unpaid'),(3,8,999,'Unpaid'),(4,7,100,'Waived');
      INSERT INTO lost_book_reports VALUES(5,7,200,'Confirmed','Unpaid'),(6,7,500,'Pending','Unpaid');
      INSERT INTO fine_payment_receipts VALUES(1,'Issued'),(2,'Reversed');
      INSERT INTO fine_payment_allocations VALUES(1,NULL,1,40),(2,NULL,2,100),(NULL,5,1,50);
      INSERT INTO fine_adjustments VALUES(1,10);
    `)
    const q={async execute(sql:string,args:unknown[]){return [(await pg.query(toPgPlaceholders(sql),args)).rows]}} as never
    const original=await borrowerBalances(q,7)
    assert.deepEqual(original,{finesCentavos:33000,replacementCentavos:15000,totalCentavos:48000})
    const paid=await borrowerBalances(q,7,[
      {kind:'Fine',targetId:1,principalCentavos:14000,paymentId:'one'},
      {kind:'Fine',targetId:2,principalCentavos:19000,paymentId:'two'},
      {kind:'LostBook',targetId:5,principalCentavos:15000,paymentId:'loss'},
      {kind:'Fine',targetId:3,principalCentavos:99900,paymentId:'other'},
    ])
    assert.equal(paid.totalCentavos,0)
    assert.deepEqual(await borrowerBalances(q,7),original)
  }finally{await pg.close()}
})
