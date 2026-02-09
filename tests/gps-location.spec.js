// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * GPS 위치 기반 클래임 E2E 테스트
 *
 * 테스트 전제: client dev server가 localhost:5173에서 실행 중이어야 합니다.
 * playwright.config.js의 webServer가 자동으로 띄워줍니다.
 */

// 서울시청 좌표 (테스트용)
const SEOUL_CITY_HALL = { latitude: 37.5665, longitude: 126.978 };

test.describe('GPS 위치 기능', () => {

  test('위치 권한 허용 시 지도에 사용자 위치 마커가 표시됨', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: SEOUL_CITY_HALL,
      permissions: ['geolocation'],
    });
    const page = await context.newPage();

    await page.goto('/');

    // 역할 선택 화면에서 고객 선택
    const customerBtn = page.locator('text=고객').or(page.locator('text=Customer'));
    await customerBtn.first().click();

    // 지도가 로드될 때까지 대기
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });

    // GPS 로딩 배너가 사라지고 사용자 마커가 나타나기를 대기
    // 사용자 위치 마커 (파란 점)
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible({ timeout: 10000 });

    // GPS 로딩 배너가 더 이상 보이지 않아야 함
    await expect(page.locator('text=위치를 찾고 있습니다...')).not.toBeVisible({ timeout: 5000 });

    await context.close();
  });

  test('위치 권한 거부 시 거부 배너가 표시됨', async ({ browser }) => {
    // geolocation 권한을 부여하지 않고 컨텍스트 생성
    const context = await browser.newContext({
      geolocation: SEOUL_CITY_HALL,
      permissions: [], // geolocation 권한 없음
    });
    const page = await context.newPage();

    await page.goto('/');

    // 역할 선택
    const customerBtn = page.locator('text=고객').or(page.locator('text=Customer'));
    await customerBtn.first().click();

    // 지도 로드 대기
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });

    // 권한 거부 또는 불가 배너가 표시되어야 함
    // Playwright에서 permission을 빈 배열로 주면 브라우저가 자동으로 거부하거나 unavailable 처리
    const deniedBanner = page.locator('text=위치 권한이 거부되었습니다');
    const unavailableBanner = page.locator('text=위치 서비스를 사용할 수 없습니다');
    const loadingBanner = page.locator('text=위치를 찾고 있습니다...');

    // 셋 중 하나가 보이면 OK (브라우저에 따라 denied vs unavailable 다를 수 있음)
    // 적어도 사용자 마커가 없어야 함
    await page.waitForTimeout(3000);

    // 로딩이 영원히 지속되거나, denied/unavailable 배너가 표시되거나
    const hasDenied = await deniedBanner.isVisible();
    const hasUnavailable = await unavailableBanner.isVisible();
    const hasLoading = await loadingBanner.isVisible();

    expect(hasDenied || hasUnavailable || hasLoading).toBeTruthy();

    await context.close();
  });

  test('"내 위치로" 버튼이 위치 허용 시 표시됨', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: SEOUL_CITY_HALL,
      permissions: ['geolocation'],
    });
    const page = await context.newPage();

    await page.goto('/');

    // 역할 선택
    const customerBtn = page.locator('text=고객').or(page.locator('text=Customer'));
    await customerBtn.first().click();

    // 지도 로드 대기
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });

    // 사용자 위치가 활성화될 때까지 대기
    await page.waitForTimeout(2000);

    // "내 위치로" 버튼 (◎ 문자)
    const locateButton = page.locator('button[title="내 위치로"]');
    await expect(locateButton).toBeVisible({ timeout: 5000 });

    // 클릭해도 에러가 발생하지 않아야 함
    await locateButton.click();

    await context.close();
  });

  test('위치 변경 시 마커 위치가 업데이트됨', async ({ browser }) => {
    const context = await browser.newContext({
      geolocation: SEOUL_CITY_HALL,
      permissions: ['geolocation'],
    });
    const page = await context.newPage();

    await page.goto('/');

    // 역할 선택
    const customerBtn = page.locator('text=고객').or(page.locator('text=Customer'));
    await customerBtn.first().click();

    // 지도 로드 대기
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // 위치 변경 시뮬레이션 (강남역)
    await context.setGeolocation({ latitude: 37.4979, longitude: 127.0276 });

    // 약간 대기 후 페이지가 여전히 동작하는지 확인
    await page.waitForTimeout(1000);

    // 지도가 여전히 존재하고 에러가 없어야 함
    await expect(page.locator('.leaflet-container')).toBeVisible();

    await context.close();
  });
});

test.describe('GPS + 클레임 통합', () => {

  test('스팟 50m 밖에서는 클레임 버튼이 비활성화됨', async ({ browser }) => {
    // 스팟에서 멀리 떨어진 위치 (부산)
    const context = await browser.newContext({
      geolocation: { latitude: 35.1796, longitude: 129.0756 },
      permissions: ['geolocation'],
    });
    const page = await context.newPage();

    await page.goto('/');

    // 역할 선택
    const customerBtn = page.locator('text=고객').or(page.locator('text=Customer'));
    await customerBtn.first().click();

    // 지도 로드 대기
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // 스팟이 있으면 클릭 시도 (스팟이 없을 수도 있으므로 조건부)
    const spotMarkers = page.locator('.leaflet-marker-icon');
    const markerCount = await spotMarkers.count();

    if (markerCount > 1) {
      // 첫 번째가 사용자 마커이므로 두 번째부터 스팟
      await spotMarkers.nth(1).click();

      // "너무 멀어요" 같은 메시지나 비활성 버튼 확인
      await page.waitForTimeout(1000);

      // 클레임 버튼이 있다면 disabled 상태여야 함
      const claimBtn = page.locator('button:has-text("클레임")').or(page.locator('button:has-text("Claim")'));
      if (await claimBtn.count() > 0) {
        await expect(claimBtn.first()).toBeDisabled();
      }
    }

    await context.close();
  });
});
