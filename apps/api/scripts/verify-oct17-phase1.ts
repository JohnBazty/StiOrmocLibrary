import assert from 'node:assert/strict'
import { db, dbDriver } from '../src/config/db.js'
import { readCatalogAvailability } from '../src/modules/catalog/catalog-availability.ts'

// Disposable, connection-local temporary tables shadow the product names only on
// this connection. ROLLBACK removes every fixture; no real school rows are used.
if (dbDriver !== 'postgres') throw new Error('This check requires the configured Postgres database.')
const client = await db.getConnection()
try {
  await client.beginTransaction()
  await client.execute('CREATE TEMP TABLE titles(title_id bigint PRIMARY KEY,lifecycle_status text,record_type text) ON COMMIT DROP',[])
  await client.execute('CREATE TEMP TABLE research_records(title_id bigint,viewing_status text) ON COMMIT DROP',[])
  await client.execute('CREATE TEMP TABLE materials(material_id bigint PRIMARY KEY,availability_status text) ON COMMIT DROP',[])
  await client.execute("CREATE TEMP TABLE physical_copies(physical_copy_id bigint,title_id bigint,material_id bigint,lifecycle_status text,availability_status text,condition_status text,accession_number text DEFAULT 'QA',barcode text DEFAULT 'QA',shelf_location text DEFAULT 'QA shelf') ON COMMIT DROP",[])
  await client.execute('CREATE TEMP TABLE research_inventory(research_inventory_id bigint,title_id bigint,accession_number text,barcode text,shelf_location text,condition_state text,availability_status text,lifecycle_status text) ON COMMIT DROP',[])
  await client.execute("INSERT INTO titles VALUES (1,'Active','Book'),(2,'Archived','Book'),(3,'Active','Research/Thesis'),(4,'Active','Research/Thesis')",[])
  await client.execute("INSERT INTO research_records VALUES (3,'Archived'),(4,'Available')",[])
  await client.execute("INSERT INTO materials VALUES (201,'Available'),(202,'Borrowed'),(203,'Available'),(204,'Available'),(205,'Available')",[])
  await client.execute("INSERT INTO physical_copies(physical_copy_id,title_id,material_id,lifecycle_status,availability_status,condition_status) VALUES (101,1,201,'Active','Available','Good'),(102,1,202,'Active','Available','Good'),(103,1,203,'Active','Available','Damaged'),(104,1,204,'Archived','Available','Good'),(105,2,205,'Active','Available','Good')",[])
  await client.execute("INSERT INTO research_inventory VALUES (401,4,'QA-R','QA-R','QA shelf','Good','Available','Active')",[])
  const result=await readCatalogAvailability(client,'1,2,3,4,999')
  assert.deepEqual(result.items,[
    {id:1,active:true,available:1,copyCount:3},
    {id:2,active:false,available:0,copyCount:0},
    {id:3,active:false,available:0,copyCount:0},
    {id:4,active:true,available:0,copyCount:0},
    {id:999,active:false,available:0,copyCount:0},
  ])
  const second=await readCatalogAvailability(client,'1')
  assert.deepEqual(second.items,[result.items[0]])
  assert.deepEqual((await readCatalogAvailability(client,'1','1')).selectedCopies?.map(copy=>copy.id),[101,102,103])
  assert.deepEqual((await readCatalogAvailability(client,'2','2')).selectedCopies,[])
  assert.equal((await readCatalogAvailability(client,'4','4')).selectedCopies?.[0].accession,'QA-R')
  console.log('PASS: Postgres stock counts, material bridge, damaged/archived copies, archived titles/research, unknown IDs, selected book/research copies and repeat reads. Temporary fixtures rolled back.')
} finally {
  await client.rollback()
  client.release()
  await db.end()
}
