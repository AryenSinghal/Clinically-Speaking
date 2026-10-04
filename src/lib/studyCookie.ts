/** Cookie remembering which study the user is working on (client writes it, server reads it as a fallback for `?study=`). */
export const STUDY_COOKIE = "epro_study";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
