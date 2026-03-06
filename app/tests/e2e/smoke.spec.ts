import { expect, test } from "@playwright/test";

test("homepage renders and links to explore", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Explore Workshops" }).first()).toBeVisible();
    await expect(page.getByText("A Better Weekend")).toBeVisible();
});

test("explore page renders filter UI", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: "Explore Workshops" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Filters" })).toBeVisible();
});

test("auth pages are reachable", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.goto("/auth/signup");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
});
