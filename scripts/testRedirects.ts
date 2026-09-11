/**
 * Test redirects by requesting various URL variants and printing final URL + status
 */

type TestCase = {
  name: string;
  url: string;
  expectedStatus?: number;
  expectedFinalUrl?: string;
};

const BASE_URL = process.env.TEST_URL || 'https://luxury-intel.com';

async function testRedirect(testCase: TestCase): Promise<boolean> {
  const { name, url, expectedStatus, expectedFinalUrl } = testCase;
  let passed = true;

  try {
    console.log(`\nTesting: ${name}`);
    console.log(`  Request URL: ${url}`);
    
    const response = await fetch(url, {
      redirect: 'manual', // Don't follow redirects automatically
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RedirectTest/1.0)',
      },
    });
    
    const status = response.status;
    let locationHeader = response.headers.get('location') || '';
    
    // Convert relative URL to absolute if needed
    let finalUrl = locationHeader;
    if (locationHeader && !locationHeader.startsWith('http')) {
      try {
        const baseUrl = new URL(url);
        finalUrl = new URL(locationHeader, baseUrl.origin).href;
      } catch {
        // If parsing fails, use the location header as-is
        finalUrl = locationHeader;
      }
    } else if (!locationHeader) {
      finalUrl = url; // No redirect, final URL is the request URL
    }
    
    console.log(`  Status: ${status}`);
    console.log(`  Location header: ${locationHeader || '(none)'}`);
    console.log(`  Final URL: ${finalUrl}`);
    
    if (expectedStatus && status !== expectedStatus) {
      console.error(`  ❌ Expected status ${expectedStatus}, got ${status}`);
      passed = false;
    } else if (expectedStatus) {
      console.log(`  ✅ Status matches expected: ${expectedStatus}`);
    }
    
    if (expectedFinalUrl) {
      // Normalize URLs for comparison (remove trailing slashes, etc.)
      const normalizedExpected = expectedFinalUrl.replace(/\/$/, '');
      const normalizedGot = finalUrl.replace(/\/$/, '');
      if (normalizedGot !== normalizedExpected && status === 308) {
        console.warn(`  ⚠️  Expected final URL ${expectedFinalUrl}, got ${finalUrl}`);
        passed = false;
      } else if (normalizedGot === normalizedExpected) {
        console.log(`  ✅ Final URL matches expected: ${expectedFinalUrl}`);
      }
    }
    
    // Check for vercel.app domain (should not appear)
    if (finalUrl.includes('vercel.app')) {
      console.error(`  ❌ ERROR: Final URL contains vercel.app domain`);
      passed = false;
    }

    // Check for www in redirect location (should be removed)
    if (status === 308 && locationHeader) {
      if (locationHeader.includes('www.luxury-intel.com') || locationHeader.includes('www.localhost')) {
        console.error(`  ❌ ERROR: Redirect location still contains www`);
        passed = false;
      }
    }

    // Check for tracking params (should be removed)
    if (finalUrl.includes('?')) {
      try {
        const urlObj = new URL(finalUrl);
        const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
        const hasTrackingParams = trackingParams.some(param => urlObj.searchParams.has(param));
        if (hasTrackingParams) {
          console.error(`  ❌ ERROR: Final URL still contains tracking parameters`);
          passed = false;
        }
      } catch {
        // URL parsing failed, skip this check
      }
    }

  } catch (error: any) {
    console.error(`  ❌ Error: ${error.message}`);
    passed = false;
  }

  return passed;
}

async function main() {
  console.log(`Testing redirects on: ${BASE_URL}`);
  console.log('='.repeat(60));
  
  const testCases: TestCase[] = [
    {
      name: 'www to non-www redirect',
      url: 'https://www.luxury-intel.com/',
      expectedStatus: 308,
    },
    {
      name: '/index.html to / redirect',
      url: 'https://luxury-intel.com/index.html',
      expectedStatus: 308,
      expectedFinalUrl: 'https://luxury-intel.com/',
    },
    {
      name: 'Strip utm_source and gclid params',
      url: 'https://luxury-intel.com/?utm_source=test&gclid=1',
      expectedStatus: 308,
      expectedFinalUrl: 'https://luxury-intel.com/',
    },
    {
      name: 'Remove trailing slash (archive/)',
      url: 'https://luxury-intel.com/archive/',
      expectedStatus: 308,
      expectedFinalUrl: 'https://luxury-intel.com/archive',
    },
    {
      name: 'Keep root trailing slash',
      url: 'https://luxury-intel.com/',
      expectedStatus: 200, // Root "/" should keep trailing slash
    },
    {
      name: 'Strip tracking but keep other params',
      url: 'https://luxury-intel.com/?page=2&utm_source=test&sort=date',
      expectedStatus: 308,
      expectedFinalUrl: 'https://luxury-intel.com/?page=2&sort=date',
    },
    {
      name: 'Trailing slash + tracking params',
      url: 'https://luxury-intel.com/archive/?utm_source=test',
      expectedStatus: 308,
      expectedFinalUrl: 'https://luxury-intel.com/archive',
    },
  ];
  
  let failures = 0;
  for (const testCase of testCases) {
    const passed = await testRedirect(testCase);
    if (!passed) failures++;
  }

  console.log('\n' + '='.repeat(60));
  if (failures > 0) {
    console.error(`❌ Redirect tests complete: ${failures}/${testCases.length} failed`);
  } else {
    console.log(`✅ Redirect tests complete: all ${testCases.length} passed`);
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
