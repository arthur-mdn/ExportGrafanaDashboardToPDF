'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');

console.log("Script grafana_pdf.js started...");

const url = process.argv[2];
const auth_string = process.argv[3];
let outfile = process.argv[4];

const width_px = 1200;
const auth_header = 'Basic ' + Buffer.from(auth_string).toString('base64');

(async () => {
  try {
    console.log("Starting browser...");
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const page = await browser.newPage();
    console.log("Browser started...");

    await page.setExtraHTTPHeaders({ 'Authorization': auth_header });

    await page.setDefaultNavigationTimeout(120000);

    await page.setViewport({
      width: width_px,
      height: 800,
      deviceScaleFactor: 2,
      isMobile: false
    });

    console.log("Navigating to URL...");
    await page.goto(url, { waitUntil: 'networkidle0' });
    console.log("Page loaded...");

    await page.evaluate(() => {
      let infoCorners = document.getElementsByClassName('panel-info-corner');
      for (let el of infoCorners) { el.hidden = true; }
      let resizeHandles = document.getElementsByClassName('react-resizable-handle');
      for (let el of resizeHandles) { el.hidden = true; }
    });

    let dashboardName = await page.evaluate(() => {
      return document.querySelector('p').innerText.trim();
    });
    console.log("Dashboard name fetched:", dashboardName);

    let date = await page.evaluate(() => {
      return document.getElementById('display_actual_date').innerText.trim();
    });
    console.log("Date fetched:", date);

    if (!dashboardName) {
      dashboardName = 'output_grafana';
    }

    if (!date) {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      date = `${year}-${month}-${day}`;
    }

    outfile = `./output/${dashboardName.replace(/\s+/g, '_')}_${date.replace(/\s+/g, '_')}.pdf`;

    const totalHeight = await page.evaluate(() => {
      const childElement = document.querySelector('.scrollbar-view').firstElementChild;
      return childElement.scrollHeight;
    });
    console.log("Page height adjusted to:", totalHeight);

    await page.evaluate(async () => {
      const scrollableSection = document.querySelector('.scrollbar-view');
      const childElement = scrollableSection.firstElementChild;

      let scrollPosition = 0;
      let viewportHeight = window.innerHeight;

      while (scrollPosition < childElement.scrollHeight) {
        scrollableSection.scrollBy(0, viewportHeight);
        await new Promise(resolve => setTimeout(resolve, 500));
        scrollPosition += viewportHeight;
      }
    });

    await page.setViewport({
      width: width_px,
      height: totalHeight,
      deviceScaleFactor: 2,
      isMobile: false
    });

    console.log("Generating PDF...");
    await page.pdf({
      path: outfile,
      width: width_px + 'px',
      height: totalHeight + 'px',
      scale: 1,
      displayHeaderFooter: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
    console.log(`PDF généré : ${outfile}`);

    await browser.close();
    console.log("Browser closed.");
  } catch (error) {
    console.error("Error during PDF generation:", error);
  }
})();
