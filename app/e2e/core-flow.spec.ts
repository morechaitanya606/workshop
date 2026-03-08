import { expect, test } from "@playwright/test";

test("explore to detail to booking start redirects unauthenticated users", async ({ page }) => {
    await page.goto("/explore");
    await expect(page).toHaveURL(/\/explore/);

    await expect(page.getByText(/workshops found/i)).toBeVisible();

    const upcomingWorkshopLink = page.locator('a[href^="/workshop/"]:not([href*="past-"])').first();
    await expect(upcomingWorkshopLink).toBeVisible({ timeout: 20_000 });

    const upcomingWorkshopHref = await upcomingWorkshopLink.getAttribute("href");
    if (!upcomingWorkshopHref) {
        throw new Error("Could not find workshop link href on explore page.");
    }

    try {
        await Promise.all([
            page.waitForURL(/\/workshop\/.+/, { timeout: 15_000 }),
            upcomingWorkshopLink.click(),
        ]);
    } catch {
        await page.goto(upcomingWorkshopHref);
    }

    await expect(page).toHaveURL(/\/workshop\/.+/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expect(page.locator('iframe[title^="Map for"]')).toBeVisible();

    const loginToBookLink = page.getByRole("link", { name: /Log in to Book/i }).first();
    if (await loginToBookLink.isVisible().catch(() => false)) {
        await loginToBookLink.click();
    } else {
        const reserveButton = page
            .getByRole("button", {
                name: /Reserve Spot|Log in to Book|Book My Spot/i,
            })
            .first();
        await expect(reserveButton).toBeVisible();
        await reserveButton.click();
    }

    await expect(page).toHaveURL(/\/auth\/login/);
});
