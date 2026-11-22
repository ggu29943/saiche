import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120000,
  retries: 0,
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 720 } },
  webServer: { command: 'npm run build && npm run preview', port: 4173, timeout: 180000, reuseExistingServer: true },
  projects: [
    { name: 'desktop', testMatch: '**/{boot,viewer,drive,menu,loadtime,smoke,screenshots}.spec.ts', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } },
    { name: 'mobile', testMatch: '**/{boot,smoke,touch,screenshots}.spec.ts', use: { ...devices['Pixel 7 landscape'], launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } },
  ],
});
