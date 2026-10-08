<?php
// Copy this to config/config.php (gitignored). On the server that is
// ~/spelltoslay-app/config/config.php.
// Generate a real key with: php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'

return [
    'teacher_key' => 'change-me-to-a-long-random-string',

    // Optional. Lets the lockersoft.games hub open the teacher panel without
    // the key ("Launch SpellToSlay" -> "Open game console"). Must be the same
    // value as LSG_HUB_SECRET_SPELLTOSLAY in the hub's environment, at least
    // 16 characters. Leave it out and hub launches are refused.
    // 'hub_secret' => 'same-value-as-the-hub',
];
