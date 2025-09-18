from playwright.sync_api import sync_playwright, expect, Page
import os

def run_verification(page: Page):
    """
    Navigates to the app, uploads a snapshot, goes to the What-Ifs page,
    runs a scenario, and takes a screenshot of the YearlyFlowsChart.
    """
    # 1. Navigate to the app
    # The dev server is running on port 5173
    page.goto("http://localhost:5173/")

    # 2. Upload a snapshot
    # The app starts on the upload page. We need to upload a sample snapshot.
    # The file input is hidden, so we target the dropzone.
    # The file path is relative to the repo root.
    snapshot_path = os.path.abspath("examples/sample_snapshot.json")
    page.locator('input[type="file"]').set_input_files(snapshot_path)

    # 3. Navigate to the What-Ifs page
    # After upload, the app navigates to /results. We need to click the link to /what-ifs.
    # Use a robust locator to find the link to the What-Ifs page.
    page.get_by_role("link", name="What-Ifs").click()
    expect(page).to_have_url("http://localhost:5173/#/what-ifs")

    # 4. Add and run a scenario
    # Click the "Add Scenario" button.
    page.get_by_role("button", name="Add Scenario").click()

    # Click the "Run scenario" button.
    page.get_by_role("button", name="Run scenario").click()

    # Wait for the scenario to finish running. The button text changes to "Re-run".
    expect(page.get_by_role("button", name="Re-run")).to_be_visible(timeout=20000) # Increased timeout for simulation

    # 5. Take a screenshot of the chart
    # Find the heading for the chart and then get the chart element itself.
    chart_heading = page.get_by_role("heading", name="Yearly Flows — Returns, Income, Expenditures")
    # The chart is in a div that is the next element sibling of the heading's parent div.
    # This seems a bit fragile. Let's find a better selector.
    # The chart is an SVG inside a div. Let's target the SVG directly.
    # The component is YearlyFlowsChart, which renders a div with an svg inside.
    # Let's find the chart by its title text inside the SVG.

    chart_container = chart_heading.locator("xpath=./following-sibling::div[1]")

    # Wait for the chart to be visible
    expect(chart_container).to_be_visible()

    # Take the screenshot
    screenshot_path = "jules-scratch/verification/verification.png"
    chart_container.screenshot(path=screenshot_path)
    print(f"Screenshot saved to {screenshot_path}")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            run_verification(page)
        finally:
            browser.close()

if __name__ == "__main__":
    main()
