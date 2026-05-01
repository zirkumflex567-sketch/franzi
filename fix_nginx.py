#!/usr/bin/env python3
conf_path = '/etc/nginx/sites-enabled/h-town-https.conf'

with open(conf_path, 'r') as f:
    lines = f.readlines()

# Remove any broken lines with xC3 or malformed regex
clean_lines = [l for l in lines if 'xC3' not in l and 'C3%84' not in l]

# Find the line with "location = /paert" and insert PÄRT redirect before it
new_lines = []
for line in clean_lines:
    if 'location = /paert' in line:
        # Add UTF-8 umlaut redirect (nginx handles this natively)
        new_lines.append('    location ~ "^/P\xc3\x84RT" { return 301 /paert/; }\n')
    new_lines.append(line)

with open(conf_path, 'w') as f:
    f.writelines(new_lines)

print('Config fixed with PÄRT redirect')
