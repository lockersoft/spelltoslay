<?php
namespace Deployer;

require 'recipe/common.php';

// SpellToSlay runs on DreamHost shared hosting, not a VPS, so the standard "release
// directory + symlink swap" Deployer pattern doesn't apply — there's no
// /var/www, no sudo, no separate deploy user. Deploy is just:
//   git fetch && git reset --hard origin/main → composer install → init_db → health check.
//
// The web doc root /home/lockersoft/spelltoslay.lockersoft.games is a symlink to
// /home/lockersoft/spelltoslay-app/public (set up once during initial provisioning;
// see README "Server setup"). Updating spelltoslay-app/ in place is an
// atomic-enough deploy for a classroom and lets us avoid Apache config
// changes that would break DreamHost's per-site SSL/cert management.

set('application',  'spelltoslay');
set('repository',   'github-spelltoslay:lockersoft/spelltoslay.git'); // SSH alias on the server
set('default_stage', 'production');

host('production')
    ->setHostname('spelltoslay.lockersoft.games')
    ->set('remote_user', 'lockersoft')
    ->set('deploy_path', '/home/lockersoft/spelltoslay-app');

task('deploy:pull', function () {
    run('cd {{deploy_path}} && git fetch origin && git reset --hard origin/main');
});

task('deploy:vendors', function () {
    run('cd {{deploy_path}} && ~/bin/composer install --no-dev --no-interaction --optimize-autoloader');
});

task('deploy:write_version', function () {
    // VERSION file = total commit count on the deployed branch. Auto-bumps by
    // one on every deploy (= every commit, given our git-pull-based deploy).
    // Surfaced to the player UI bottom-right via /api/health.php.
    run('cd {{deploy_path}} && git rev-list --count HEAD > VERSION');
});

task('deploy:init_db', function () {
    // Idempotent — CREATE TABLE IF NOT EXISTS. Safe on every deploy.
    run('cd {{deploy_path}} && php scripts/init_db.php');
});

task('deploy:health_check', function () {
    $body = runLocally('curl -fsS https://spelltoslay.lockersoft.games/api/health.php');
    if (!str_contains($body, '"ok":true')) {
        throw new \RuntimeException("Health check failed: $body");
    }
    writeln("<info>health: $body</info>");
});

desc('Deploy SpellToSlay to spelltoslay.lockersoft.games');
task('deploy', [
    'deploy:pull',
    'deploy:vendors',
    'deploy:init_db',
    'deploy:write_version',
    'deploy:health_check',
]);

// Quick rollback: hard-reset to a specific SHA. Usage: dep rollback to=<sha>
desc('Roll back to a specific commit');
task('rollback', function () {
    $sha = get('to', '');
    if (!$sha) throw new \RuntimeException('Pass to=<sha>, e.g. dep rollback to=abc1234');
    run("cd {{deploy_path}} && git fetch origin && git reset --hard $sha");
    run('cd {{deploy_path}} && ~/bin/composer install --no-dev --no-interaction --optimize-autoloader');
    run('cd {{deploy_path}} && git rev-list --count HEAD > VERSION');
});
