const { execSync } = require('child_process');

console.log('Starting git operations...');
try {
    console.log('1. Adding files...');
    execSync('git add -A', { stdio: 'inherit' });

    console.log('2. Committing...');
    try {
        execSync('git commit -m "Initial commit: ClipBeeMAX Tool"', { stdio: 'inherit' });
    } catch (e) {
        console.log('   (Note: Nothing to commit or already committed)');
    }

    console.log('3. Setting branch to main...');
    execSync('git branch -M main', { stdio: 'inherit' });

    console.log('4. Setting remote origin...');
    try {
        execSync('git remote add origin https://github.com/icemusike/clipbee-max-tool.git', { stdio: 'inherit' });
    } catch (e) {
        execSync('git remote set-url origin https://github.com/icemusike/clipbee-max-tool.git', { stdio: 'inherit' });
    }

    console.log('5. Pushing to GitHub...');
    execSync('git push -u origin main', { stdio: 'inherit' });

    console.log('\n✅ Push successful!');
} catch (error) {
    console.error('\n❌ Error executing git commands:', error.message);
}
