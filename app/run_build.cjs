const { execSync } = require('child_process');
const fs = require('fs');

try {
    console.log('Running npm run build...');
    const tc = execSync('npm run build', { encoding: 'utf-8', stdio: 'pipe' });
    fs.writeFileSync('build_result_new.log', tc || 'Success');
} catch (e) {
    fs.writeFileSync('build_result_new.log', (e.stdout || '') + '\n' + (e.stderr || '') + '\n' + (e.message || ''));
}
