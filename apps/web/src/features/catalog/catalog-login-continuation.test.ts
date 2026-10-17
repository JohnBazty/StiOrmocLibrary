import { describe, expect, it } from 'vitest'
import { catalogAuthLink, catalogLoginDestination } from './catalog-login-continuation'
describe('catalog login continuation',()=>{
 it('carries only a valid selected title between login and registration',()=>{expect(catalogAuthLink('/register','?catalogTitleId=42&return=https://example.com')).toBe('/register?catalogTitleId=42');expect(catalogAuthLink('/login','?catalogTitleId=42')).toBe('/login?catalogTitleId=42');expect(catalogAuthLink('/login','?catalogTitleId=-3')).toBe('/login')})
 it('keeps a selected title for Student and Faculty',()=>{expect(catalogLoginDestination('?catalogTitleId=42','Student')).toBe('/student/library?titleId=42&request=1');expect(catalogLoginDestination('?catalogTitleId=42','Faculty')).toBe('/faculty/library?titleId=42&request=1')})
 it('rejects invalid targets and keeps personnel in their own workspace',()=>{for(const search of ['?catalogTitleId=//example.com','?catalogTitleId=-1','?catalogTitleId=1.5','?catalogTitleId=999999999999999999'])expect(catalogLoginDestination(search,'Student')).toBe('/student/dashboard');expect(catalogLoginDestination('?catalogTitleId=42','Staff')).toBe('/staff/dashboard')})
})
