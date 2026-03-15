import { expect, test } from "@playwright/test";

test("explore to detail to booking start redirects unauthenticated users", async ({ page }) => {
    await page.goto("/explore");
    await expect(page).toHaveURL(/\/explore/);

    await expect(page.getByText(/workshops found/i)).toBeVisible();

    const workshopLinks = page.locator('a[href^="/workshop/"]:not([href*="past-"])');
    await expect(workshopLinks.first()).toBeVisible({ timeout: 20_000 });

    const workshopCount = await workshopLinks.count();
    if (workshopCount === 0) {
        throw new Error("No workshops found on explore page.");
    }

    let navigatedToBookableWorkshop = false;

    for (let index = 0; index < workshopCount; index += 1) {
        const workshopLink = workshopLinks.nth(index);
        const workshopText = (await workshopLink.innerText()).toLowerCase();
        if (workshopText.includes("sold out")) {
            continue;
        }

        const workshopHref = await workshopLink.getAttribute("href");
        if (!workshopHref) {
            continue;
        }

        try {
            await Promise.all([
                page.waitForURL(/\/workshop\/.+/, { timeout: 15_000 }),
                workshopLink.click(),
            ]);
        } catch {
            await page.goto(workshopHref);
        }

        await expect(page).toHaveURL(/\/workshop\/.+/);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        const pastEventBadge = page.getByText(/Past Event/i).first();
        const waitlistButton = page.getByRole("button", { name: /Join Waitlist/i }).first();
        const isPastEvent = await pastEventBadge.isVisible().catch(() => false);
        const isWaitlistOnly = await waitlistButton.isVisible().catch(() => false);

        if (isPastEvent || isWaitlistOnly) {
            await page.goto("/explore");
            await expect(page).toHaveURL(/\/explore/);
            await expect(page.getByText(/workshops found/i)).toBeVisible();
            continue;
        }

        navigatedToBookableWorkshop = true;
        break;
    }

    if (!navigatedToBookableWorkshop) {
        throw new Error("No upcoming workshop with available seats found on explore page.");
    }

    await expect(page.locator('iframe[title^="Map for"]')).toBeVisible();

    const loginToBookLinks = page.getByRole("link", { name: /Log in to Book/i });
    const loginLinkCount = await loginToBookLinks.count();
    let clickedLoginLink = false;

    for (let index = 0; index < loginLinkCount; index += 1) {
        const loginLink = loginToBookLinks.nth(index);
        if (await loginLink.isVisible().catch(() => false)) {
            await loginLink.click();
            clickedLoginLink = true;
            break;
        }
    }

    if (!clickedLoginLink) {
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
