// Single hardcoded admin email allowed to manage credit coupons.
// Checked against the authenticated session's user.email (from auth.users,
// not user-editable metadata) — see CURTA_BUILD_GUIDE.md §13.
export const ADMIN_EMAIL = 'ernj@cin.ufpe.br';
