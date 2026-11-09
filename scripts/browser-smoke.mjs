import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.STUDY_BASE_URL ?? 'http://127.0.0.1:8080';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifacts = path.join(process.cwd(), 'tests', 'llm-topic-user-study', 'artifacts');
await mkdir(artifacts, { recursive: true });

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function answerMatrix(page, defaultLabel = 'Neutral') {
  const rows = page.locator('.alignmentTrial__responseGroup');
  const count = await rows.count();
  check(count >= 1 && count <= 5, `Expected 1-5 matrix rows; found ${count}.`);
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    await row.getByRole('radio', { name: new RegExp(`: ${defaultLabel}$`) }).check();
  }
  check(!(await page.getByTestId('study-next-button').isDisabled()), 'Completed matrix should enable Next.');
  return count;
}

async function reachFirstImagePage(page, participantId, instructionScreenshot) {
  const recruitmentParams = new URLSearchParams({
    PROLIFIC_PID: participantId,
    STUDY_ID: 'browser-smoke-study',
    SESSION_ID: `browser-smoke-session-${participantId}`,
  });
  await page.goto(`${baseUrl}/llm-topic-alignment?${recruitmentParams}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByRole('checkbox', { name: /I have read/ }).check();
  const next = page.getByTestId('study-next-button');
  check(!(await next.isDisabled()), 'Consent should enable Next.');
  await next.click();

  await page.getByRole('heading', { name: 'Demographics information' }).waitFor();
  const workerId = page.getByRole('textbox', {
    name: /Please provide your worker ID/,
  });
  check(await workerId.inputValue() === participantId, 'PROLIFIC_PID did not prefill worker ID.');
  await page.getByRole('combobox', { name: 'Have you taken this test before?' }).selectOption('No');
  await page.getByRole('radio', { name: 'Prefer to self-describe' }).check();
  const selfDescribe = page.getByRole('textbox', { name: 'Please self-describe your gender' });
  check(!(await selfDescribe.isDisabled()), 'Self-description input should be enabled.');
  await page.getByRole('combobox', { name: 'How old are you?' }).selectOption('26-35');
  await page.getByRole('combobox', {
    name: 'What is the highest level of education you have received?',
  }).selectOption('Graduate school');
  const complexDescription = page.getByRole('textbox', {
    name: /Describe the most complex visualization/,
  });
  await complexDescription.fill('A dense scientific network diagram with many linked nodes.');
  check(await next.isDisabled(), 'Missing gender self-description should keep Next disabled.');
  await selfDescribe.fill('Self-described');
  check(!(await next.isDisabled()), 'Completed demographics should enable Next.');
  await next.click();

  await page.getByRole('heading', { name: 'How to complete the study' }).waitFor();
  const instructionImage = page.getByAltText('Example bar chart used only in the instructions');
  await instructionImage.evaluate((element) => element.decode());
  check(await instructionImage.evaluate((element) => element.naturalWidth > 0), 'Instruction bar chart failed to load.');
  check(await page.locator('.studyInstructions__callout').count() === 3, 'Instruction callouts are incomplete.');
  check(
    (await page.getByText(/means the amount of detail or intricacy/).count()) === 1,
    'Visual-complexity definition is missing.',
  );
  if (instructionScreenshot) {
    await page.screenshot({ path: instructionScreenshot, fullPage: true });
  }
  await next.click();
  await page.locator('.alignmentTrial').waitFor();
  check(await page.getByTestId('app-aside').count() === 0, 'Study Browser must be hidden from participants.');
}

async function runViewport(browser, viewport, browserName, fullFlow = false) {
  const context = await browser.newContext({ viewport, screen: viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.setDefaultTimeout(10000);
  const participantId = `smoke-${browserName}-${viewport.width}x${viewport.height}-${Date.now()}`;
  await reachFirstImagePage(
    page,
    participantId,
    fullFlow ? path.join(artifacts, `${browserName}-instructions-${viewport.width}x${viewport.height}.png`) : undefined,
  );

  const image = page.locator('.alignmentTrial__image');
  await image.evaluate((element) => element.decode());
  const dimensions = await image.evaluate((element) => ({
    naturalWidth: element.naturalWidth,
    naturalHeight: element.naturalHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  }));
  check(dimensions.naturalWidth > 0 && dimensions.naturalHeight > 0, 'Stimulus image failed to load.');
  check(dimensions.clientWidth > 0 && dimensions.clientHeight > 0, 'Stimulus image is not visible.');
  check(await page.getByRole('columnheader', { name: 'Strongly disagree' }).isVisible(), 'First scale label is hidden.');
  check(await page.getByRole('columnheader', { name: 'Strongly agree' }).isVisible(), 'Last scale label is hidden.');
  check(await page.getByRole('columnheader', { name: 'Cannot judge' }).isVisible(), 'Cannot-judge column is hidden.');
  check(await page.getByTestId('study-next-button').isDisabled(), 'Unanswered matrix should disable Next.');

  const nextBox = await page.getByTestId('study-next-button').boundingBox();
  const mainBox = await page.locator('.mantine-AppShell-main').boundingBox();
  check(await page.getByRole('button', { name: 'Previous' }).count() === 0, 'First image page should hide Previous.');
  check(
    nextBox && mainBox && nextBox.x > mainBox.x + mainBox.width / 2,
    'First image page should keep Next on the right.',
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  check(!overflow, 'Page has horizontal document overflow.');

  await page.screenshot({
    path: path.join(artifacts, `${browserName}-${viewport.width}x${viewport.height}.png`),
    fullPage: true,
  });

  if (fullFlow) {
    check(
      await page.locator('button.alignmentTrial__imageFrame').count() === 0,
      'The stimulus image itself should not be clickable.',
    );
    const lens = page.locator('.alignmentTrial__lens');
    check(await lens.count() === 0, 'The magnification lens should be hidden before image hover.');
    await image.hover();
    await lens.waitFor();
    check(
      await lens.evaluate((element) => getComputedStyle(element).backgroundImage !== 'none'),
      'The hover lens does not contain the magnified visualization.',
    );
    await page.screenshot({
      path: path.join(artifacts, `${browserName}-hover-lens-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
    await image.click();
    check(
      await page.getByRole('dialog', { name: 'Visualization at original resolution' }).count() === 0,
      'Clicking the image should not open a modal.',
    );
    await page.mouse.move(2, 2);
    check(await lens.count() === 0, 'The magnification lens should disappear after pointer leave.');

    const firstUrl = page.url();
    const firstImageSlug = await page.locator('.alignmentTrial').getAttribute('data-image-slug');
    const firstOrder = await page.locator('.alignmentTrial__responseGroup > th').allTextContents();
    await answerMatrix(page);
    await page.keyboard.press('Space');
    await page.waitForURL((url) => url.href !== firstUrl);
    await page.waitForFunction((slug) => (
      document.querySelector('.alignmentTrial')?.getAttribute('data-image-slug') !== slug
    ), firstImageSlug);

    const secondUrl = page.url();
    const secondPreviousBox = await page.getByRole('button', { name: 'Previous' }).boundingBox();
    const secondNextBox = await page.getByTestId('study-next-button').boundingBox();
    check(
      secondPreviousBox && secondNextBox && mainBox
        && secondPreviousBox.x < mainBox.x + mainBox.width / 2
        && secondNextBox.x > mainBox.x + mainBox.width / 2,
      'Previous and Next are not positioned on opposite sides after the first image.',
    );

    const secondImageSlug = await page.locator('.alignmentTrial').getAttribute('data-image-slug');
    const secondRows = page.locator('.alignmentTrial__responseGroup');
    const secondCount = await secondRows.count();
    const firstStatement = (await secondRows.nth(0).locator('th').innerText()).trim();
    const cannotJudgeRadio = secondRows.nth(0).getByRole('radio', {
      name: new RegExp(`${firstStatement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: I cannot judge`),
    });
    const cannotJudgeBox = await cannotJudgeRadio.boundingBox();
    check(cannotJudgeBox, 'Cannot-judge control is not visible.');
    await page.mouse.click(
      cannotJudgeBox.x + cannotJudgeBox.width / 2,
      cannotJudgeBox.y + cannotJudgeBox.height / 2,
    );
    await page.waitForTimeout(50);
    const checkedCannotJudge = page.locator(
      '.alignmentTrial input[aria-label$="I cannot judge this statement from the image"]:checked',
    );
    check(await checkedCannotJudge.count() === 1, 'Cannot-judge selection did not remain checked.');
    const comment = page.getByPlaceholder('For example: the text is too small to read');
    check(await comment.isVisible(), 'Cannot judge should reveal the optional reason field.');
    await comment.fill('The labels are too small in this pilot.');
    for (let index = 1; index < secondCount; index += 1) {
      await secondRows.nth(index).getByRole('radio', { name: /: Agree$/ }).check();
    }
    check(!(await page.getByTestId('study-next-button').isDisabled()), 'Mixed matrix answers should enable Next.');
    await page.getByTestId('study-next-button').click();
    await page.waitForURL((url) => url.href !== secondUrl);
    await page.getByRole('button', { name: 'Previous' }).click();
    await page.waitForURL(secondUrl);
    await page.waitForFunction((slug) => (
      document.querySelector('.alignmentTrial')?.getAttribute('data-image-slug') === slug
    ), secondImageSlug);
    check(await comment.inputValue() === 'The labels are too small in this pilot.', 'Cannot-judge comment was not restored.');

    const resumedOrder = await page.locator('.alignmentTrial__responseGroup > th').allTextContents();
    const resumeUrl = page.url();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.alignmentTrial').waitFor();
    check(page.url() === resumeUrl, 'Refresh did not resume the same image page.');
    check(
      JSON.stringify(resumedOrder) === JSON.stringify(
        await page.locator('.alignmentTrial__responseGroup > th').allTextContents(),
      ),
      'Question order changed after refresh.',
    );

    await page.getByRole('button', { name: 'Previous' }).click();
    await page.waitForURL(firstUrl);
    await page.waitForFunction((slug) => (
      document.querySelector('.alignmentTrial')?.getAttribute('data-image-slug') === slug
    ), firstImageSlug);
    check(
      JSON.stringify(firstOrder) === JSON.stringify(
        await page.locator('.alignmentTrial__responseGroup > th').allTextContents(),
      ),
      'Question order changed after returning with Previous.',
    );
    await page.getByTestId('study-next-button').click();
    await page.waitForURL(secondUrl);
    await page.waitForFunction((slug) => (
      document.querySelector('.alignmentTrial')?.getAttribute('data-image-slug') === slug
    ), secondImageSlug);
    await page.getByTestId('study-next-button').click();

    for (let imageIndex = 2; imageIndex < 10; imageIndex += 1) {
      await page.locator('.alignmentTrial').waitFor();
      const currentImageSlug = await page.locator('.alignmentTrial').getAttribute('data-image-slug');
      await answerMatrix(page, 'Slightly agree');
      await page.keyboard.press('Space');
      await page.waitForFunction((slug) => (
        document.querySelector('.alignmentTrial')?.getAttribute('data-image-slug') !== slug
      ), currentImageSlug);
    }

    await page.getByRole('heading', { name: 'Before you finish' }).waitFor();
    check(await page.getByTestId('study-next-button').isDisabled(), 'End feedback rating should be required.');
    await page.getByRole('radio', { name: 'Good', exact: true }).check();
    await page.getByRole('textbox', { name: /comments or suggestions/ }).fill('The study was clear.');
    await page.getByTestId('study-next-button').click();
    await page.getByRole('heading', { name: 'Thank you!' }).waitFor();
    await page.getByTestId('study-next-button').click();
    await page.getByText(/Thank you for participating\. Your response has been saved locally/).waitFor();
  }

  check(pageErrors.length === 0, `Browser page errors: ${pageErrors.join('; ')}`);
  await context.close();
  console.log(`PASS ${browserName} ${viewport.width}x${viewport.height}`);
}

const edge = await chromium.launch({ headless: true, executablePath: edgePath });
await runViewport(edge, { width: 1366, height: 768 }, 'edge', true);
await runViewport(edge, { width: 1024, height: 768 }, 'edge');
await runViewport(edge, { width: 1920, height: 1080 }, 'edge');
await edge.close();

const chrome = await chromium.launch({ headless: true, executablePath: chromePath });
await runViewport(chrome, { width: 1366, height: 768 }, 'chrome');
await chrome.close();

console.log('Browser smoke tests passed.');
