/** Where «إعدادات الحساب» (pause / delete) lives: its own page with `dashboard_redesign` on, else the bottom of the profile page */
export function accountSettingsHref(redesign: boolean): string {
  return redesign ? "/dashboard/account/settings" : "/dashboard/profile#account-settings";
}
