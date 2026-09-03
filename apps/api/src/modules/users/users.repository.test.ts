import assert from 'node:assert/strict'
import test from 'node:test'
import { parseActiveUserFilters } from './users.repository.ts'
test('active user filters are normalized and paginated safely',()=>{const result=parseActiveUserFilters({q:'  John  ',page:'2',limit:'999',role:'Student'});assert.equal(result.q,'John');assert.equal(result.page,2);assert.equal(result.limit,100);assert.equal(result.role,'Student')})
