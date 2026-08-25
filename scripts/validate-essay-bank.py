import json, sys, re, glob, os
sys.stdout.reconfigure(encoding='utf-8')

# Valid ids come from the course content itself, so this stays correct as the
# material changes. Run from the repo root: python scripts/validate-essay-bank.py
CONTENT = 'data/klados-zois/content.json'
BANK = 'data/klados-zois/essay-bank.json'
VALID_TOPICS = set()
VALID_CHAPTERS = set()
_content = json.load(open(CONTENT, encoding='utf-8'))
for _ch in _content['chapters']:
    VALID_CHAPTERS.add(_ch['id'])
    for _t in _ch['topics']:
        VALID_TOPICS.add(_t['id'])

# expected metadata from CORPUS.md
EXPECT = {
 'e-anagkes':(9,'2026-06',1,'core'), 'e-finplan':(7,'2026-06',0,'core'),
 'e-priips':(6,'2026-04',0,'core'), 'e-proskairi':(6,'2026-06',0,'core'),
 'e-atixima':(6,'2026-06',0,'core'), 'e-minidefs':(6,'2026-06',8,'core'),
 'e-factors':(5,'2026-06',0,'core'), 'e-katatheseis':(4,'2026-04',0,'heating'),
 'e-ofelimata':(4,'2026-06',0,'core'), 'e-aitisi':(4,'2025-04',0,'cooling'),
 'e-omadiki':(3,'2025-12',0,'core'), 'e-aparagrapti':(3,'2025-06',0,'cooling'),
 'e-axiologisi':(2,'2026-04',0,'heating'), 'e-apaitisi':(2,'2026-06',0,'heating'),
 'e-typoi':(2,'2025-06',0,'rare'), 'e-symferon':(1,'2025-02',0,'rare'),
 'e-syntaxiodotika':(1,'2024-10',0,'rare'), 'e-xeplyma':(1,'2025-04',0,'rare'),
}
BAD_MARKUP = re.compile(r'<[a-zA-Z/]|&lt;|&amp;|^#{1,6}\s|\|\s*---|__', re.M)

def check_entry(e, errs, warns, src):
    eid = e.get('id','?')
    for f in ('id','title','prompts','chapterId','topicIds','frequency','lastSeen','slot','trend','keyPoints','modelAnswer'):
        if f not in e: errs.append(f"{src}:{eid} missing field {f}")
    if eid in EXPECT:
        fr, ls, sl, tr = EXPECT[eid]
        if e.get('frequency') != fr: errs.append(f"{src}:{eid} frequency {e.get('frequency')} != {fr}")
        if e.get('lastSeen') != ls: errs.append(f"{src}:{eid} lastSeen {e.get('lastSeen')} != {ls}")
        if e.get('slot') != sl: errs.append(f"{src}:{eid} slot {e.get('slot')} != {sl}")
        if e.get('trend') != tr: errs.append(f"{src}:{eid} trend {e.get('trend')} != {tr}")
    else:
        errs.append(f"{src}:{eid} unknown id")
    if e.get('chapterId') not in VALID_CHAPTERS: errs.append(f"{src}:{eid} bad chapterId {e.get('chapterId')}")
    for t in e.get('topicIds') or []:
        if t not in VALID_TOPICS: errs.append(f"{src}:{eid} bad topicId {t}")
    if not (1 <= len(e.get('topicIds') or []) <= 4): errs.append(f"{src}:{eid} topicIds count {len(e.get('topicIds') or [])}")
    kp = e.get('keyPoints') or []
    # e-minidefs keyPoints are how-to-answer guidance; its real rubric lives per item
    # The cap keeps rubric points tickable, not to limit coverage: an entry that
    # must answer several question variants legitimately carries more points.
    cap = 12 + 2 * max(0, len(e.get('prompts') or []) - 1)
    if eid != 'e-minidefs' and not (6 <= len(kp) <= cap):
        errs.append(f"{src}:{eid} keyPoints {len(kp)} outside 6-{cap}")
    for k in kp:
        if len(k) > 220: warns.append(f"{src}:{eid} keyPoint long ({len(k)}): {k[:50]}…")
    ps = e.get('prompts') or []
    if not ps: errs.append(f"{src}:{eid} no prompts")
    for p in ps:
        if not p.get('text','').strip(): errs.append(f"{src}:{eid} empty prompt text")
        if not p.get('papers'): errs.append(f"{src}:{eid} prompt without papers")
    ma = e.get('modelAnswer','')
    words = len(ma.split())
    if not (150 <= words <= 700): warns.append(f"{src}:{eid} modelAnswer {words} words")
    m = BAD_MARKUP.search(ma)
    if m: errs.append(f"{src}:{eid} disallowed markup in modelAnswer: {m.group(0)!r}")
    if '**' in ma and ma.count('**') % 2: errs.append(f"{src}:{eid} unbalanced ** in modelAnswer")

errs, warns = [], []
entries, minis = [], []
for f in [BANK]:
    d = json.load(open(f, encoding='utf-8'))
    src = os.path.basename(f)
    if True:
        for e in d['entries']:
            check_entry(e, errs, warns, src); entries.append(e)
        for it in d.get('miniDefinitions', []):
            minis.append(it)
            for fld in ('id','term','times','papers','topicIds','keyPoints','modelAnswer'):
                if fld not in it: errs.append(f"{src}:{it.get('id','?')} mini missing {fld}")
            for t in it.get('topicIds') or []:
                if t not in VALID_TOPICS: errs.append(f"{src}:{it.get('id')} bad topicId {t}")
            w = len(it.get('modelAnswer','').split())
            if not (50 <= w <= 220): warns.append(f"{src}:{it.get('id')} mini modelAnswer {w} words")
            if not (3 <= len(it.get('keyPoints') or []) <= 5): errs.append(f"{src}:{it.get('id')} mini keyPoints {len(it.get('keyPoints') or [])}")

ids = [e['id'] for e in entries]
dupes = {i for i in ids if ids.count(i) > 1}
if dupes: errs.append(f"duplicate entry ids: {dupes}")
print(f"entries: {len(entries)}  minis: {len(minis)}")
print(f"ERRORS ({len(errs)}):");  [print('  ✗', e) for e in errs]
print(f"WARNINGS ({len(warns)}):"); [print('  ~', w) for w in warns]
missing = set(EXPECT) - set(ids)
if missing: print("MISSING ENTRIES:", sorted(missing))
sys.exit(1 if errs else 0)
