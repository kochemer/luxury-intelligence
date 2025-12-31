import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST() {
  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'buildMonthlyDigest.ts');
    
    // Verify script exists
    const fs = await import('fs/promises');
    try {
      await fs.access(scriptPath);
    } catch {
      throw new Error(`Script not found: ${scriptPath}`);
    }
    
    console.log(`Executing build script: ${scriptPath}`);
    
    // Execute the build script using tsx
    const { stdout, stderr } = await execAsync(`npx tsx "${scriptPath}"`, {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      env: { ...process.env },
    });
    
    console.log('Build stdout:', stdout);
    if (stderr) {
      console.log('Build stderr:', stderr);
    }
    
    // Check for actual errors in stderr (tsx may output warnings to stderr)
    if (stderr && !stderr.includes('Building digest') && !stderr.includes('Warning') && stderr.toLowerCase().includes('error')) {
      throw new Error(`Build script error: ${stderr}`);
    }
    
    // Extract monthLabel from output (format: "Building digest for month: YYYY-MM")
    const monthMatch = stdout.match(/Building digest for month: (\d{4}-\d{2})/);
    if (!monthMatch) {
      console.error('Build output:', stdout);
      console.error('Build stderr:', stderr);
      throw new Error(`Could not determine month label from build output. stdout: ${stdout.substring(0, 500)}`);
    }
    
    const monthLabel = monthMatch[1];
    const outputPath = path.join(process.cwd(), 'data', 'digests', `${monthLabel}.json`);
    
    // Verify file was created
    try {
      await fs.access(outputPath);
    } catch {
      throw new Error(`Digest file was not created at: ${outputPath}`);
    }
    
    return NextResponse.json({
      ok: true,
      monthLabel,
      path: outputPath,
    });
  } catch (error) {
    console.error('Error building digest:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error stack:', errorStack);
    
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

