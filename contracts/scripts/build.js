const fs = require('fs');
const path = require('path');
const { compileFunc } = require('@ton-community/func-js');

async function main() {
  console.log('Building Tokamon contract...');

  const contractPath = path.join(__dirname, '../src/tokamon.fc');
  const outputPath = path.join(__dirname, '../build/tokamon.cell');
  const outputCodePath = path.join(__dirname, '../build/tokamon.code.boc');

  // Read source
  const source = fs.readFileSync(contractPath, 'utf-8');

  // Compile with stdlib included
  const result = await compileFunc({
    targets: ['tokamon.fc'],
    sources: (filePath) => {
      if (filePath === 'tokamon.fc') {
        return source;
      }
      // Return stdlib from func-js
      return fs.readFileSync(
        path.join(require.resolve('@ton-community/func-js'), '../../asm/', filePath),
        'utf-8'
      );
    },
  });

  if (result.status === 'error') {
    console.error('Compilation error:');
    console.error(result.message);
    process.exit(1);
  }

  // Write output
  const buildDir = path.dirname(outputPath);
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // Write as hex for easier reading
  fs.writeFileSync(outputPath, result.codeBoc);
  fs.writeFileSync(outputCodePath, Buffer.from(result.codeBoc, 'base64'));
  
  console.log(`✓ Built successfully`);
  console.log(`  Code: ${outputPath}`);
  console.log(`  Size: ${Buffer.from(result.codeBoc, 'base64').length} bytes`);
}

main().catch(console.error);
