// A `?server=` link to a relay this browser has not joined asks first (server-link-confirm.ts), and the game does not
// boot until the prompt is answered. A probe that opens such a link answers Join here, as a player would.
export async function joinServerPrompt(page, timeout = 420000) {
  await page.getByRole('button', { name: 'Join', exact: true }).click({ timeout });
}
