import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function login(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/");
  await page.getByLabel("Il tuo nome di prova").fill(name);
  await page.getByRole("button", { name: "Entra nella lobby" }).click();
  await expect(page.getByText("Che cosa giochiamo?")).toBeVisible();
  return page;
}

async function createRoom(page: Page, gameName: "Tris" | "Forza 4"): Promise<string> {
  const card = page.locator("article.game-card").filter({ hasText: gameName });
  await card.getByRole("button", { name: "Crea stanza" }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}$/u);
  return page.url().split("/").at(-1)!;
}

async function joinRoom(page: Page, roomId: string): Promise<void> {
  await page.getByLabel("Hai un codice?").fill(roomId);
  await page.getByRole("button", { name: "Entra", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/room/${roomId}$`, "u"));
  await expect(page.getByText("Connesso")).toBeVisible();
}

async function readyAndStart(host: Page, guest: Page): Promise<void> {
  await guest.getByRole("button", { name: "Sono pronto" }).click();
  await host.getByRole("button", { name: "Sono pronto" }).click();
  const start = host.getByRole("button", { name: "Inizia partita" });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(host.getByRole("heading", { name: "Tocca a te" })).toBeVisible();
}

async function trisMove(page: Page, position: number): Promise<void> {
  await expect(page.getByRole("heading", { name: "Tocca a te" })).toBeVisible();
  await page.getByRole("gridcell", { name: `Cella ${position + 1}: vuota` }).click();
}

async function columnMove(page: Page, column: number): Promise<void> {
  await expect(page.getByRole("heading", { name: "Tocca a te" })).toBeVisible();
  await page.getByRole("button", { name: `Inserisci pedina nella colonna ${column}` }).click();
}

test("demo multiplayer: Tris, spettatore, rivincita, Forza 4 e layout", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const spectatorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const alice = await login(aliceContext, "Alice E2E");
  const bob = await login(bobContext, "Bob E2E");
  const spectator = await login(spectatorContext, "Spettatore E2E");

  const trisRoom = await createRoom(alice, "Tris");
  await joinRoom(bob, trisRoom);
  await readyAndStart(alice, bob);
  await joinRoom(spectator, trisRoom);
  await expect(spectator.getByText("Spettatore", { exact: true })).toBeVisible();
  await expect(spectator.getByRole("gridcell", { name: "Cella 1: vuota" })).toBeDisabled();

  await trisMove(alice, 0);
  await trisMove(bob, 3);
  await trisMove(alice, 1);
  await trisMove(bob, 4);
  await trisMove(alice, 2);
  await expect(alice.getByRole("heading", { name: /Alice E2E ha vinto/u })).toBeVisible();
  await alice.screenshot({ path: "test-results/tris-desktop.png", fullPage: true });
  await spectator.screenshot({ path: "test-results/tris-mobile-spectator.png", fullPage: true });

  await alice.getByRole("button", { name: "Chiedi rivincita" }).click();
  await bob.getByRole("button", { name: "Chiedi rivincita" }).click();
  await expect(bob.getByRole("heading", { name: "Tocca a te" })).toBeVisible();

  await alice.goto("/");
  await bob.goto("/");
  const connectRoom = await createRoom(alice, "Forza 4");
  await joinRoom(bob, connectRoom);
  await readyAndStart(alice, bob);
  await columnMove(alice, 1);
  await columnMove(bob, 2);
  await columnMove(alice, 1);
  await columnMove(bob, 2);
  await columnMove(alice, 1);
  await columnMove(bob, 2);
  await columnMove(alice, 1);
  await expect(alice.getByRole("heading", { name: /Alice E2E ha vinto/u })).toBeVisible();
  await expect(alice.locator(".connect-board .disc.player-x")).toHaveCount(4);

  await aliceContext.close();
  await bobContext.close();
  await spectatorContext.close();
});
