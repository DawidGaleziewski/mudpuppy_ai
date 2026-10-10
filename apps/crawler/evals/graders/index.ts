/**
 * The graders: turn a finished run into scores and checks. Nothing here starts a server or an
 * agent. Grouped by kind (code-based, model-based, human); only code-based ones exist so far.
 */
export { grade, type GradeInput, type Grades } from './grade.js';
export { portalSecrets } from './code/leaks.js';
