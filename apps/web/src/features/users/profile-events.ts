/** Refresh the signed-in account display after the owner saves profile details. */
export const PROFILE_UPDATED_EVENT = 'smartlib:profile-updated'
export function notifyProfileUpdated() { window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT)) }
