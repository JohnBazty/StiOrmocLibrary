import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(new URL('../../../../../database/supabase/038_research_optional_details.sql', import.meta.url), 'utf8')

test('038 lets adviser and abstract be empty, and can run twice', async () => {
  const pg = new PGlite()
  await pg.exec(`CREATE TABLE public.research_records (id SERIAL PRIMARY KEY, adviser_name VARCHAR(255) NOT NULL, abstract_text TEXT NOT NULL);
    CREATE TABLE public.research_inventory (id SERIAL PRIMARY KEY, adviser VARCHAR(255) NOT NULL);`)
  await assert.rejects(pg.exec('INSERT INTO public.research_records (adviser_name, abstract_text) VALUES (NULL, NULL)'))
  await pg.exec(migration)
  await pg.exec(migration)
  await pg.exec('INSERT INTO public.research_records (adviser_name, abstract_text) VALUES (NULL, NULL)')
  await pg.exec('INSERT INTO public.research_inventory (adviser) VALUES (NULL)')
  await pg.close()
})
