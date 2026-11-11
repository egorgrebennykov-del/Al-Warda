import os
import re

public_components = [
    'About.jsx', 'BookDetails.jsx', 'Cart.jsx', 'Checkout.jsx', 'Contacts.jsx',
    'Discount.jsx', 'Featured.jsx', 'Footer.jsx', 'Header.jsx', 'Home.jsx',
    'Join.jsx', 'Login.jsx', 'MessengerModal.jsx', 'NewBooks.jsx', 'NotFound.jsx',
    'Orders.jsx', 'Profile.jsx', 'Search.jsx', 'SearchResults.jsx', 'Sets.jsx',
    'SignUp.jsx', 'Testimonial.jsx', 'WardaAssistant.jsx', 'PhoneInput.jsx',
    'LargeAnnouncementRoulette.jsx', 'SmallAnnouncements.jsx'
]

results = []
for root, dirs, files in os.walk('Al-Warda/src/components'):
    if 'privileged' in root:
        continue
    for f in files:
        if f in public_components or f.endswith('.jsx'):
            fp = os.path.join(root, f)
            with open(fp, 'r', encoding='utf-8') as fl:
                lines = fl.readlines()
            for idx, line in enumerate(lines):
                trimmed = line.strip()
                if trimmed.startswith('//') or trimmed.startswith('/*') or trimmed.startswith('*'):
                    continue
                # Look for Cyrillic characters outside t(...)
                if re.search(r'[а-яА-ЯёЁ]{2,}', trimmed):
                    if 't(' not in trimmed:
                        results.append(f'{f}:{idx+1} {trimmed[:120]}')

with open('scripts/public_untranslated.txt', 'w', encoding='utf-8') as out:
    out.write('\n'.join(results))

print(f'Found {len(results)} issues in public components.')
