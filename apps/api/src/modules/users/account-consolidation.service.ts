import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'

type MergeInput = { survivorSchoolId: string; retiredSchoolId: string; reason: string }
type Backup = (connection: PoolConnection, accountIds: number[], userIds: number[]) => Promise<void>

/** Repair only the retained login of an already recorded consolidation. CLI maintenance only. */
export function createConsolidatedRoleRepairService(database: Pool) {
  return { async repair(input: MergeInput, backup: Backup) {
    if (!input.survivorSchoolId || !input.retiredSchoolId || input.survivorSchoolId === input.retiredSchoolId || input.reason.trim().length < 3 || input.reason.length > 300) {
      throw new HttpError(422, 'ACCOUNT_REPAIR_INVALID', 'Identify the retained and archived personnel logins and document the repair.')
    }
    const q = await database.getConnection()
    try {
      await q.beginTransaction()
      const [accounts] = await q.execute<RowDataPacket[]>(`SELECT account_id,user_id,school_id,role,account_status
        FROM accounts WHERE school_id IN (?,?) ORDER BY account_id FOR UPDATE`, [input.survivorSchoolId,input.retiredSchoolId])
      const target = accounts.find(a=>a.school_id===input.survivorSchoolId)
      const retired = accounts.find(a=>a.school_id===input.retiredSchoolId)
      if (accounts.length !== 2 || !target?.user_id || !retired?.user_id || Number(target.user_id) === Number(retired.user_id)
        || !['Admin','Librarian'].includes(target.role) || target.account_status !== 'Active'
        || retired.role !== 'Librarian' || retired.account_status !== 'Archived') {
        throw new HttpError(409, 'ACCOUNT_REPAIR_STATE', 'The retained and retired identities do not match a completed consolidation.')
      }
      const accountIds=[Number(target.account_id),Number(retired.account_id)]
      const userIds=[Number(target.user_id),Number(retired.user_id)]
      const [profiles] = await q.execute<RowDataPacket[]>('SELECT user_id,school_id,user_role,role_id,account_status FROM users WHERE user_id IN (?,?) ORDER BY user_id FOR UPDATE',userIds)
      const targetProfile=profiles.find(u=>Number(u.user_id)===userIds[0])
      const retiredProfile=profiles.find(u=>Number(u.user_id)===userIds[1])
      const [roles] = await q.execute<RowDataPacket[]>("SELECT role_id FROM roles WHERE role_name='Librarian'")
      if (roles.length !== 1 || !targetProfile || !retiredProfile || targetProfile.school_id !== target.school_id
        || retiredProfile.school_id !== retired.school_id || targetProfile.user_role !== 'Librarian'
        || Number(targetProfile.role_id) !== Number(roles[0].role_id) || targetProfile.account_status !== 'Active'
        || retiredProfile.user_role !== 'Librarian' || retiredProfile.account_status !== 'Archived') {
        throw new HttpError(409, 'ACCOUNT_REPAIR_PROFILE_STATE', 'Review linked profile roles and identities before repairing access.')
      }
      const [history] = await q.execute<RowDataPacket[]>(`SELECT event_id FROM account_management_events
        WHERE account_id=? AND actor_account_id=? AND action_code='ConsolidatedInto' LIMIT 1`, [accountIds[1],accountIds[0]])
      if (!history.length) throw new HttpError(409, 'ACCOUNT_REPAIR_HISTORY', 'Recorded consolidation authorization is required.')
      if (target.role === 'Librarian') {
        await q.commit()
        return {changed:false,accountId:accountIds[0],dashboard:'/librarian/dashboard'}
      }
      await backup(q,accountIds,userIds)
      await q.execute("UPDATE accounts SET role='Librarian',auth_version=auth_version+1,updated_at=NOW() WHERE account_id=?",[accountIds[0]])
      await q.execute('UPDATE users SET auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?',[userIds[0]])
      await q.execute('UPDATE account_recovery_challenges SET code_expires_at=NOW(),code_hash=NULL,reset_token_hash=NULL,reset_expires_at=NULL,updated_at=NOW() WHERE account_id=?',[accountIds[0]])
      await q.execute(`INSERT INTO account_management_events(account_id,actor_account_id,action_code,previous_status,new_status,changed_fields,reason)
        VALUES (?,?,'RoleReconciled','Active','Active','role',?)`,[accountIds[0],accountIds[0],input.reason])
      await q.commit()
      return {changed:true,accountId:accountIds[0],dashboard:'/librarian/dashboard'}
    } catch(error) {await q.rollback();throw error} finally {q.release()}
  } }
}

/** Administrative maintenance operation. Never exposed as a public/authenticated route. */
export function createAccountConsolidationService(database: Pool) {
  return { async merge(input: MergeInput, backup: Backup) {
    if (!input.survivorSchoolId || !input.retiredSchoolId || input.survivorSchoolId.length>50 || input.retiredSchoolId.length>50 || input.survivorSchoolId === input.retiredSchoolId || input.reason.trim().length < 3 || input.reason.length > 300) {
      throw new HttpError(422, 'ACCOUNT_MERGE_INVALID', 'Choose two different personnel logins and document the consolidation.')
    }
    const q = await database.getConnection()
    try {
      await q.beginTransaction()
      const [rows] = await q.execute<RowDataPacket[]>(`SELECT account_id,user_id,school_id,role,account_status
        FROM accounts WHERE school_id IN (?,?) ORDER BY account_id FOR UPDATE`, [input.survivorSchoolId,input.retiredSchoolId])
      const survivor = rows.find(r=>r.school_id===input.survivorSchoolId), retired = rows.find(r=>r.school_id===input.retiredSchoolId)
      if (!survivor?.user_id || !retired?.user_id || Number(survivor.user_id)===Number(retired.user_id)) {
        throw new HttpError(409, 'ACCOUNT_MERGE_LINKS', 'Both personnel accounts must have distinct linked profiles.')
      }
      if (!['Admin','Librarian'].includes(survivor.role) || survivor.account_status!=='Active' || retired.role!=='Librarian' || !['Active','Archived'].includes(retired.account_status)) {
        throw new HttpError(409, 'ACCOUNT_MERGE_STATE', 'The personnel account state does not match this consolidation.')
      }
      const ids=[Number(survivor.account_id),Number(retired.account_id)], users=[Number(survivor.user_id),Number(retired.user_id)]
      const [profiles] = await q.execute<RowDataPacket[]>('SELECT user_id,school_id,user_role,role_id,account_status FROM users WHERE user_id IN (?,?) ORDER BY user_id FOR UPDATE',users)
      const target = profiles.find(r=>Number(r.user_id)===users[0]), source = profiles.find(r=>Number(r.user_id)===users[1])
      if (!target || !source || target.school_id!==survivor.school_id || source.school_id!==retired.school_id || target.user_role!==survivor.role || source.user_role!==retired.role || target.account_status!==survivor.account_status || source.account_status!==retired.account_status) {
        throw new HttpError(409, 'ACCOUNT_MERGE_PROFILE_STATE', 'Linked profile identities or statuses need reconciliation first.')
      }
      const [roles] = await q.execute<RowDataPacket[]>("SELECT role_id FROM roles WHERE role_name='Librarian'")
      if (roles.length!==1) throw new HttpError(409, 'ACCOUNT_MERGE_ROLE', 'The canonical Librarian role must exist exactly once.')
      if (survivor.role==='Librarian' && retired.account_status==='Archived') {
        if (Number(target.role_id)!==Number(roles[0].role_id)) throw new HttpError(409,'ACCOUNT_MERGE_ROLE','The retained profile role needs reconciliation.')
        const [events] = await q.execute<RowDataPacket[]>(`SELECT event_id FROM account_management_events
          WHERE account_id=? AND actor_account_id=? AND action_code='ConsolidatedInto' LIMIT 1`, [ids[1],ids[0]])
        if (!events.length) throw new HttpError(409, 'ACCOUNT_MERGE_UNVERIFIED', 'An archived login without consolidation history needs review.')
        await q.commit()
        return { changed:false, survivorAccountId:ids[0], retiredAccountId:ids[1], dashboard:'/librarian/dashboard' }
      }
      if (retired.account_status!=='Active') throw new HttpError(409,'ACCOUNT_MERGE_STATE','Only an active temporary Librarian can be consolidated.')
      const [activity] = await q.execute<RowDataPacket[]>(`SELECT
        (SELECT COUNT(*) FROM borrow_transactions WHERE user_id=? AND transaction_status IN ('Pending','Borrowed','Overdue')) loans,
        (SELECT COUNT(*) FROM reservations WHERE user_id=? AND reservation_status IN ('received','pending','approved','preparing','ready_for_pickup')) requests,
        (SELECT COUNT(*) FROM in_library_uses WHERE user_id=? AND ended_at IS NULL) reading,
        (SELECT COUNT(*) FROM attendance_logs WHERE user_id=? AND time_out IS NULL) visits,
        (SELECT COUNT(*) FROM print_requests WHERE user_id=? AND job_status NOT IN ('Completed','Cancelled')) printing`, Array(5).fill(users[1]))
      if (Object.values(activity[0]).some(v=>Number(v)>0)) throw new HttpError(409, 'ACCOUNT_MERGE_OPEN_ACTIVITY', 'Complete the temporary account’s open activity before retiring its login.')
      // Backup is mandatory and runs inside the same transaction before any data update.
      await backup(q,ids,users)
      await q.execute("UPDATE accounts SET role='Librarian',auth_version=auth_version+1,updated_at=NOW() WHERE account_id=?",[ids[0]])
      await q.execute("UPDATE users SET user_role='Librarian',role_id=?,auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?",[roles[0].role_id,users[0]])
      await q.execute("UPDATE accounts SET account_status='Archived',auth_version=auth_version+1,updated_at=NOW() WHERE account_id=?",[ids[1]])
      await q.execute("UPDATE users SET account_status='Archived',auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?",[users[1]])
      await q.execute(`UPDATE account_recovery_challenges SET code_expires_at=NOW(),reset_token_hash=NULL,reset_expires_at=NULL,updated_at=NOW() WHERE account_id IN (?,?)`,ids)
      await q.execute(`INSERT INTO account_management_events(account_id,actor_account_id,action_code,previous_status,new_status,changed_fields,reason)
        VALUES (?,?, 'RoleConsolidated','Active','Active','role,user_role,role_id',?),
          (?,?, 'ConsolidatedInto','Active','Archived','account_status',?)`,
        [ids[0],ids[0],`${input.reason} Retired login: ${input.retiredSchoolId}.`,ids[1],ids[0],`${input.reason} Retained login: ${input.survivorSchoolId}; historical IDs and records preserved.`])
      await q.commit()
      return { changed:true, survivorAccountId:ids[0], retiredAccountId:ids[1], dashboard:'/librarian/dashboard' }
    } catch(error) {await q.rollback();throw error} finally {q.release()}
  } }
}
