"""RC3.3 corrections for atlas 97001 RC3.2, from the owner's audit atlas97001_rc32_audit.zip.

Every confirmed finding has exactly one disposition here: either addressed operations (FIX) or a
documented HOLD. Operations are exact substring replacements; the builder fails when the expected
text is not present the expected number of times. Strings are NFC-normalised by the builder.

Target forms: 'p152:b002:s02' -> node id 'a97001:p152:b002:s02' (all copies under pages);
'term:<term id suffix>' -> canonical term in every section that defines it.
"""

AUDIT_SHA256 = '8c000be19e22c3069311d16b2d39a0bf8e104698bc8323942f6a3c5491183835'

# Classes: V = changes how the line is read aloud, N = normative pointing without a sound change,
# S = source text restored from the scan, R = Russian/editorial, T = canonical term, U = reader UI,
# M = scan mapping/structure.
FIX, HOLD = 'fix', 'hold'

D = {}  # finding_id -> disposition dict


def fix(fid, cls, *ops, note=''):
    assert fid not in D, fid
    D[fid] = {'action': FIX, 'class': cls, 'ops': list(ops), 'note': note}


def hold(fid, cls, reason):
    assert fid not in D, fid
    D[fid] = {'action': HOLD, 'class': cls, 'ops': [], 'reason': reason}


def code(fid, cls, what):
    """Fixed in reader code, not in data."""
    assert fid not in D, fid
    D[fid] = {'action': 'code', 'class': cls, 'ops': [], 'note': what}


def s(target, field, frm, to, n=1):
    """Replace frm by to; frm must occur exactly n times (n='+' means at least once, all replaced)."""
    return {'op': 'sub', 'target': target, 'field': field, 'from': frm, 'to': to, 'n': n}


def ss(targets, field, frm, to, n=1):
    return [s(t, field, frm, to, n) for t in targets]


def tri(target, ni, tr=None, ru=None, n=1):
    """Pointing + both transliterations of one word, each a (from, to) pair."""
    out = [s(target, 'he_niqqud', ni[0], ni[1], n)]
    if tr:
        out.append(s(target, 'translit', tr[0], tr[1], n))
    if ru:
        out.append(s(target, 'translit_ru', ru[0], ru[1], n))
    return out


def flat(*parts):
    out = []
    for p in parts:
        out.extend(p if isinstance(p, list) else [p])
    return out


# --- s00-front / s01-units: סֵמֶל, dagesh ---------------------------------------------------------
for fid, t in [('A001-005-D001', 'p1:b004'), ('A001-005-D002', 'p4:t-base-units:cell:0:2'),
               ('A001-005-D003', 'p4:t-prefixes:cell:0:1'), ('A001-005-D004', 'p4:t-derived-units:cell:0:1'),
               ('A001-005-D005', 'p5:t-derived-units:cell:0:1')]:
    fix(fid, 'N', s(t, 'he_niqqud', 'סֶמֶל', 'סֵמֶל'))
fix('A001-005-D006', 'N', s('p2:b006:s01', 'he_niqqud', 'מוּשְׂגֵי', 'מוּשְּׂגֵי'), s('p2:b006:s01', 'he_niqqud', 'חוּקִים', 'חוּקִּים'))
fix('A001-005-D007', 'N', s('p3:b006:s01', 'he_niqqud', 'וּמוּשְׂגֵי', 'וּמוּשְּׂגֵי'))
fix('A001-005-D008', 'N', s('p4:b006', 'he_niqqud', 'קִידוֹמוֹת', 'קִידּוֹמוֹת'))
fix('A001-005-D009', 'N', s('p4:t-prefixes:cell:0:0', 'he_niqqud', 'קִידוֹמֶת', 'קִידּוֹמֶת'))
fix('A001-005-D010', 'V', *tri('p3:b005', ('הַחוֹמָרִים', 'הֶחוֹמָרִים'), ('hakhomarim', 'hekhomarim'), ('хахомарим', 'хэхомарим')))
fix('A001-005-D011', 'T', s('term:dimension', 'niqqud', 'מִידָה', 'מִידָּה', '+'), s('p3:b002', 'he_niqqud', 'מִידָה', 'מִידָּה'))
fix('A001-050-F001', 'V', *tri('p6:b002', ('מֻשָּׂגֵי', 'מֻשְּׂגֵי'), ('musagei', 'musgei'), ('мусагэи', 'мусгэи')))

# Slash abbreviations (p28-32): Hebrew keeps the source abbreviation; both readings spell the full alternatives.
SL1 = ('Bamikre ze veyesh koakh/ot natuy/im nesamen et zavit/yot hakoakh/ot beyakhas letsir ha-x.',
       'Bamikre ze veyesh koakh natuy / kokhot netuyim nesamen et zavit / zaviyot hakoakh / hakokhot beyakhas letsir ha-x.')
SL1R = ('бамикрэ зэ вэйэш коах/от натуй/им нэсамэн эт завит/йот хакоах/от бэйахас лэцир ха-x.',
        'бамикрэ зэ вэйэш коах натуй / кохот нэтуйим нэсамэн эт завит / завийот хакоах / хакохот бэйахас лэцир ха-x.')
SL2 = ('Nefarek koakh/ot natuy/im lirkhivim', 'Nefarek koakh natuy / kokhot netuyim lirkhivim')
SL2R = ('нэфарэк коах/от натуй/им лирхивим', 'нэфарэк коах натуй / кохот нэтуйим лирхивим')
for fid, t in [('A001-050-F002', 'p28:b004'), ('A001-050-F004', 'p29:b006'), ('A001-050-F005', 'p31:b006')]:
    fix(fid, 'V', s(t, 'translit', *SL1), s(t, 'translit_ru', *SL1R),
        note='Hebrew keeps the source slash; speech gets the full alternatives (speech-overrides).')
for fid, t in [('A001-050-F003', 'p28:b008:s01'), ('A001-050-F006', 'p32:b002')]:
    fix(fid, 'V', s(t, 'translit', *SL2), s(t, 'translit_ru', *SL2R),
        note='Hebrew keeps the source slash; speech gets the full alternatives (speech-overrides).')
for fid, t in [('A001-050-F007', 'p47:b002'), ('A001-050-F008', 'p48:b004'), ('A001-050-F009', 'p48:b006:s02')]:
    fix(fid, 'N', s(t, 'he_niqqud', 'סִיבּוּבִית', 'סִיבוּבִית'), note='Attested modern reading sivuvit kept; pointing aligned.')

# --- statics ---------------------------------------------------------------------------------------
fix('A006-015-D001', 'V', *tri('p12:b012:s03', ('תּוֹצְאַת', 'תּוֹצָאַת'), ("totse'at", "totsa'at"), ('тоцэ’ат', 'тоца’ат')))
fix('A006-015-D002', 'N', s('p15:b002', 'he_niqqud', 'פְּעוּלָתָם', 'פְּעוּלָּתָם'), s('p15:b005', 'he_niqqud', 'פְּעוּלָה', 'פְּעוּלָּה'))
fix('A016-025-D001', 'N', s('p17:b002:s01', 'he_niqqud', 'נַיָּחַת', 'נַיַּחַת'), s('term:fixed-pulley', 'niqqud', 'נַיָּחַת', 'נַיַּחַת', '+'))
fix('A016-025-D002', 'N', *flat(
    ss(['p16:b006', 'p19:b002:s01', 'p22:b005:s01', 'p17:b003:s01'], 'he_niqqud', 'פְּעוּלַת', 'פְּעוּלַּת'),
    s('p16:b007:s01', 'he_niqqud', 'פְּעוּלָה', 'פְּעוּלָּה', '+')))
fix('A016-025-D003', 'N', *ss(['p21:b008', 'p21:b009'], 'he_niqqud', 'יְסוּמַן', 'יְסוּמַּן'))
fix('A016-025-D004', 'N', s('p24:b003:s01:s01', 'he_niqqud', 'מִנְּקוּדָה', 'מִנְּקוּדָּה'))
hold('A016-025-D005', 'M', 'Vector mark over F lives only in the figure raster; the audit itself says the arrow head is not reliably distinguishable. Source raster kept; no text node to change.')
fix('A026-035-D001', 'V', s('p28:b007', 'he_niqqud', 'תּוֹצְאַת', 'תּוֹצָאַת'))
fix('A026-035-D002', 'N', *ss(['p28:b006:s01', 'p29:b008:s01', 'p31:b008:s01', 'p31:b002:s01'], 'he_niqqud', 'קוּדָה', 'קוּדָּה', '+'))
fix('A026-035-D003', 'V', s('p28:b011', 'translit', 'mishvaot', "mishve'ot"), s('p28:b011', 'translit_ru', 'мишваот', 'мишвэ’от'),
    note='Modern construct plural mishve’ot, matching the pointing מִשְׁוְאוֹת.')
fix('A026-035-D004', 'V', *flat(*[tri(t, ('מִשְׁווַאת', 'מִשְׁווְאַת'), ('mishvat', "mishve'at"), ('мишват', 'мишвэ’ат'))
                                   for t in ['p34:b006:s02', 'p35:b002', 'p37:b005:s01', 'p38:b002:s01']]))
fix('A036-050-D001', 'V', *tri('p40:b005:s02', ('תּוֹצָאוֹת', 'תּוֹצְאוֹת'), ('totsa ot', "tots'ot"), ('тоца от', 'тоц’от')))

# --- dynamics, centroid, drawing (p51-100) ---------------------------------------------------------
fix('A51-100-001', 'V', *tri('p86:b003', ('מְעוּף הַקֶּלַע', 'מְעוֹף הַקֶּלַע'), ("me'uf hakela", "me'of hakela"), ('мэ’уф хакэла', 'мэ’оф хакэла')),
    *tri('p86:b004', ('הַמְּעוּף', 'הַמָּעוֹף'), ("hame'uf", "hama'of"), ('хамэ’уф', 'хама’оф')))
fix('A51-100-002', 'V', *tri('p87:b007', ('זָוִית מְעוּף', 'זָוִית מָעוֹף'), ("Zavit me'uf", "Zavit ma'of"), ('завит мэ’уф', 'завит ма’оф')),
    s('term:flight-angle', 'niqqud', 'מְעוּף', 'מָעוֹף', '+'), s('term:flight-angle', 'translit', "me'uf", "ma'of", '+'),
    s('term:flight-angle', 'translit_ru', 'мэ’уф', 'ма’оф', '+'))
fix('A51-100-003', 'S', *[s('p91:img01:label:tangent-velocity', f, 'VA', 'VB') for f in ['he', 'he_niqqud', 'translit', 'translit_ru', 'ru']],
    note='Source label is V_B; the inconsistency with point A belongs to the source and is not corrected.')
code('A51-100-005', 'U', 'Reader draws the stored source_marks/source_annotations: the excluded negative root is struck through.')
code('A51-100-006', 'U', 'Reader draws the stored source_marks/source_annotations: the excluded negative root is struck through.')
fix('A51-100-D01', 'N', *ss(['p67:b002', 'p69:b002:s01', 'p73:b002:s01'], 'he_niqqud', 'קוּדָה', 'קוּדָּה', '+'))
fix('A51-100-D02', 'N', *ss(['p96:b005:s01', 'p99:b004'], 'he_niqqud', 'הֶיטֵל', 'הֶיטֵּל', '+'))
fix('A51-100-D06', 'N', s('p68:b002:s02', 'he_niqqud', 'הַגְּרַף', 'הַגְּרָף'))
fix('A51-100-D07', 'V', *tri('p57:b002:s01', ('הַחוֹמָרִים', 'הֶחוֹמָרִים'), ('hakhomarim', 'hekhomarim'), ('хахомарим', 'хэхомарим')))
fix('A51-100-E01', 'N', *flat(ss(['p73:b003', 'p73:b008', 'p75:b003', 'p78:b002'], 'he_niqqud', 'קוּדָה', 'קוּדָּה', '+'),
                               ss(['p76:b002-s04:value', 'p78:b002', 'p78:b004:s03'], 'he_niqqud', 'קוּדַת', 'קוּדַּת', '+')))
fix('A51-100-E02', 'N', s('p77:b005', 'he_niqqud', 'צֻוַּין', 'צוּיַּן'))
fix('A51-100-F01', 'N', *flat(ss(['p94:b003:s05', 'p94:b004', 'p95:b001', 'p100:b003'], 'he_niqqud', 'הֶיטֵל', 'הֶיטֵּל'),
                               ss(['p97:b002', 'p100:b004:s01'], 'he_niqqud', 'הֵיטֵלִים', 'הֶיטֵּלִים', '+')))
fix('A51-100-F02', 'V', *tri('p94:b003:s01', ('שֶׁמַּטְּרָה', 'שֶׁמַּטָּרָה'), ('shematra', 'shematara'), ('шэматра', 'шэматара')))
fix('A51-100-F03', 'V', *tri('p100:b002:s03', ('מְשׁוּרְטָט', 'מְשׂוּרְטָט'), ('meshurtat', 'mesurtat'), ('мэшуртат', 'мэсуртат')))
fix('A51-100-F04', 'N', s('p100:b002:s06', 'he_niqqud', 'מְרַבִּיוֹת', 'מְרַבִּיּוֹת'))
fix('A51-100-F05', 'N', s('p100:b004:s04', 'he_niqqud', 'מִנְּקוּדַת', 'מִנְּקוּדַּת'), s('p100:b004:s04', 'he_niqqud', 'מִנְּקוּדוֹת', 'מִנְּקוּדּוֹת'))
fix('A51-100-GF01', 'S', {'op': 'flag', 'target': 'p54:img03:region:triangle:label:01', 'key': 'editorial_addition',
                          'value': {'source_text': False, 'reason_ru': 'Подпись y отсутствует в оригинале; добавлена редактором.'}})
for fid in ['A51-100-GF02', 'A51-100-GF03', 'A51-100-SF01', 'A51-100-SF02', 'A51-100-ST01', 'A51-100-ST02', 'A51-100-ST03', 'A51-100-ST04']:
    hold(fid, 'M', 'Scan-region coordinates only: text is correct, reading and speech are unaffected. Needs a separate raster measurement pass.')
hold('A51-100-ST05', 'M', 'Sub-figure crops for the centroid table need new image assets; the full source raster is still shown. Separate pass.')
fix('A51-100-T01', 'T', *[s('term:' + t, 'niqqud', 'הֶיטֵל', 'הֶיטֵּל', '+') for t in ['frontal-section', 'horizontal-section', 'profile-section']])
fix('A51-100-T02', 'T', s('term:hatched-area', 'niqqud', 'מְקֻוְקָּו', 'מְקֻוְקָו', '+'))

# --- p101-150 -------------------------------------------------------------------------------------
fix('A101-150-F001', 'S', *[s('p106:img01:label-offset-y', f, '6', '6.1') for f in ['he', 'he_niqqud', 'translit', 'translit_ru', 'ru']])
fix('A101-150-F003', 'S', *[s('p129:img01-symbol10', f, 'ΔL', 'Δl') for f in ['he', 'he_niqqud', 'translit', 'translit_ru', 'ru']])
fix('D101-114-AKUM', 'V', *tri('p106:b002:s02', ('הָעָקוּם', 'הֶעָקוּם'), ('haakum', 'he’akum'), ('хаакум', 'хэ’акум')))
fix('D101-114-DIE-FORGING', 'V', *tri('p111:t-stock-roughness:die-forging-method', ('בִּטְבָעִים', 'בְּטַבָּעִים'), ('bitvaim', 'betabaim'), ('битваим', 'бэтабаим')))
fix('D101-114-SECTION-left', 'N', s('p108:t-profile-left:header-profile', 'he_niqqud', 'חֲתָךְ הַפְּרוֹפִיל', 'חֲתַךְ הַפְּרוֹפִיל'))
fix('D101-114-SECTION-right', 'N', s('p108:t-profile-right:header-profile', 'he_niqqud', 'חֲתָךְ הַפְּרוֹפִיל', 'חֲתַךְ הַפְּרוֹפִיל'))
HKH = (('הַחוֹמָרִים', 'הֶחוֹמָרִים'), ('hakhomarim', 'hekhomarim'), ('хахомарим', 'хэхомарим'))
BKH = (('בַּחוֹמָרִים', 'בֶּחוֹמָרִים'), ('bakhomarim', 'bekhomarim'), ('бахомарим', 'бэхомарим'))
fix('D115-123-CHOMARIM-115-b001', 'V', *tri('p115:b001', *HKH))
fix('D115-123-CHOMARIM-115-b003-s01', 'V', *tri('p115:b003:s01', *HKH))
fix('D115-123-CHOMARIM-117-b003-s02', 'V', *tri('p117:b003:s02', *HKH))
fix('D115-123-CHOMARIM-117-b003-s03', 'V', *tri('p117:b003:s03', *BKH))
fix('D115-123-CHOMARIM-117-b003-s04', 'V', *tri('p117:b003:s04', *BKH))
fix('D115-123-CHOMARIM-117-b008', 'V', *tri('p117:b008', *HKH))
fix('D115-123-ELASTICITY', 'N', s('p123:b007', 'he_niqqud', 'אֶלַסְטִיּוּת', 'אֵלַסְטִיּוּת'))
fix('D115-123-KEMERKAZIM', 'V', *tri('p118:b004', ('כִּמְרְכָּזִים', 'כְּמֶרְכָּזִים'), ('kimerkazim', 'kemerkazim'), ('кимэрказим', 'кэмэрказим')))
fix('D115-123-MESHUSHE-BODY', 'N', s('p120:b012', 'he_niqqud', 'מְשׁוּשֶׁה', 'מְשׁוּשֶּׁה'))
fix('D115-123-MESHUSHE-TERM', 'T', s('term:hcp', 'niqqud', 'מְשׁוּשֶׁה', 'מְשׁוּשֶּׁה', '+'))
CHEM = ('Химические свойства – реакция, описывающие реакцию материала на окружающую среду с изменениями его состава.',
        'Химические свойства – описывают реакцию материала на окружающую среду, сопровождаемую изменениями его состава.')
FAT = ('Усталость (механическая) – сила материала выдерживать циклическую силу.',
       'Усталость (механическая) – способность материала выдерживать циклически действующую силу.')
fix('D115-123-RU-chemical-properties', 'R', s('p123:b001', 'ru', *CHEM))
fix('D115-123-RU-fatigue', 'R', s('p123:b010:s02', 'ru', *FAT))
fix('D115-123-RU-TERM-chemical-properties', 'R', s('term:chemical-properties', 'source_definition_ru', *CHEM, n='+'))
fix('D115-123-RU-TERM-fatigue', 'R', s('term:fatigue', 'source_definition_ru', *FAT, n='+'))
fix('D115-123-TMISA-TERM-solid-solution', 'T', s('term:solid-solution', 'niqqud', 'תְּמִיסָה', 'תְּמִיסָּה', '+'))
fix('D115-123-TMISA-TERM-solution', 'T', s('term:solution', 'niqqud', 'תְּמִיסָה', 'תְּמִיסָּה', '+'))
for fid, t in [('D115-123-TMISA-b004', 'p117:b004'), ('D115-123-TMISA-b005', 'p117:b005'), ('D115-123-TMISA-b006', 'p117:b006')]:
    fix(fid, 'N', s(t, 'he_niqqud', 'תְּמִיסָה', 'תְּמִיסָּה', '+'))

SHT = (('שְׁטַח', 'שֶׁטַח'), ('Shtakh', 'Shetakh'), ('штах', 'шэтах'))
for fid, t in [('D124-128-AREA-126-b005', 'p126:b005'), ('D124-128-AREA-127-b007-s03', 'p127:b007:s03'),
               ('D124-128-AREA-128-b002-s04', 'p128:b002:s04'), ('D129-140-AREA-129-b002-s05', 'p129:b002:s05'),
               ('D129-140-AREA-130-b006', 'p130:b006'), ('D129-140-AREA-130-b010-s02', 'p130:b010:s02'),
               ('D129-140-AREA-132-b006-s03', 'p132:b006:s03'), ('D129-140-AREA-136-b001-s03', 'p136:b001:s03'),
               ('D129-140-AREA-137-b003', 'p137:b003')]:
    fix(fid, 'V', *tri(t, *SHT))
DGM = (('דְּגַם', 'דֶּגֶם'), ('Dgam', 'Degem'), ('дгам', 'дэгэм'))
for fid, t in [('D124-128-DEGEM-b004', 'p124:b004'), ('D124-128-DEGEM-b007', 'p124:b007'), ('D124-128-DEGEM-b008-s01', 'p124:b008:s01')]:
    fix(fid, 'V', *tri(t, *DGM))
fix('A141-150-D010', 'V', *tri('p145:img01-specimen', *DGM))
fix('A151-203-F002', 'V', *tri('p152:b002:s02', *DGM))

# Construct מַאֲמַץ before a following noun (patah, no sound change).
CONSTRUCT = ['מַאֲמָץ הַכְּנִיעָה', 'מַאֲמָץ כְּנִיעָה', 'מַאֲמָץ הַמְּתִיחָה', 'מַאֲמָץ מְתִיחָה', 'מַאֲמָץ הִתְעַיְּפוּת', 'מַאֲמָץ מְשִׁיכָה']


def construct(target):
    return {'op': 'subs', 'target': target, 'field': 'he_niqqud',
            'pairs': [[c, c.replace('מַאֲמָץ', 'מַאֲמַץ', 1)] for c in CONSTRUCT]}


for fid, t in [('D124-128-MAAMATS-125-b002', 'p125:b002'), ('D124-128-MAAMATS-125-l-yield', 'p125:l-yield'),
               ('D124-128-MAAMATS-126-b002', 'p126:b002'), ('D124-128-MAAMATS-127-b006', 'p127:b006'),
               ('D124-128-MAAMATS-127-b007-s01', 'p127:b007:s01'), ('D124-128-MAAMATS-128-b001', 'p128:b001'),
               ('D124-128-MAAMATS-128-b002-s01', 'p128:b002:s01'), ('D129-140-STRESS-129-b002-s01', 'p129:b002:s01'),
               ('D129-140-STRESS-129-b004', 'p129:b004'), ('D129-140-STRESS-133-b004', 'p133:b004'),
               ('D129-140-STRESS-133-b005-s01', 'p133:b005:s01'), ('D129-140-STRESS-133-b006', 'p133:b006'),
               ('D129-140-STRESS-133-b007-s01', 'p133:b007:s01'), ('D129-140-STRESS-134-b001', 'p134:b001')]:
    fix(fid, 'N', construct(t))
fix('D124-128-YIELD-TERM', 'T', s('term:yield-point', 'niqqud', 'מַאֲמָץ כְּנִיעָה', 'מַאֲמַץ כְּנִיעָה', '+'))
fix('D124-128-SECTION-CONSTRUCT', 'N', s('p124:b008:s02', 'he_niqqud', 'חֲתָךְ הַחוֹמֶר', 'חֲתַךְ הַחוֹמֶר'))
fix('D129-140-BRONZE', 'N', s('p134:b002:s07', 'he_niqqud', 'אֲרָד', 'אָרָד'))
fix('D129-140-HARD-FEMININE', 'V', *tri('p130:b006', ('קָשֶׁה יוֹתֵר', 'קָשָׁה יוֹתֵר'), ('Kashe Yoter', 'Kasha Yoter'), ('кашэ йотэр', 'каша йотэр')))
for fid, t in [('D129-140-MEAN-131-b004', 'p131:b004'), ('D129-140-MEAN-132-b006-s05', 'p132:b006:s05'),
               ('D129-140-MEAN-135-b003', 'p135:b003'), ('D129-140-MEAN-136-b001-s05', 'p136:b001:s05')]:
    fix(fid, 'N', s(t, 'he_niqqud', 'מְמוּצָע', 'מְמוּצָּע', '+'))
fix('D129-140-MEAN-TERM', 'T', s('term:mean-diagonal', 'niqqud', 'מְמוּצָע', 'מְמוּצָּע', '+'))
fix('D129-140-RU-SOURCE-GRAMMAR', 'R', {'op': 'flag', 'target': 'p132:b004:s02', 'key': 'source_grammar_note',
    'value': {'source_text': 'שעקב נוצרים זרימה פלסטית שוליים',
              'note_ru': 'Фраза оригинала грамматически повреждена; перевод — минимальное толкование по контексту, не дословный.'}})
for fid in ['D129-140-SOURCEONLY-131-GLYPH', 'D129-140-SOURCEONLY-137-DIALS']:
    hold(fid, 'M', 'Unreadable raster glyphs; the audit forbids inventing d or dial digits. Stays an explicit limitation.')

fix('A141-150-D001', 'V', *flat(*[tri(t, ('בַּדֶּגֶם הַמִּבְחַן', 'בְּדֶגֶם הַמִּבְחָן'), ('Badegem Hamivkhan', 'Bedegem Hamivkhan'), ('бадэгэм хамивхан', 'бэдэгэм хамивхан'))
                                   for t in ['p142:b005', 'p143:b005']]))
fix('A141-150-D002', 'V', *flat(*[tri(t, ('בַּתְּחוּם', 'בִּתְחוּם'), ('Batkhum', 'Bitkhum'), ('батхум', 'битхум')) for t in ['p146:b003:s01', 'p146:b003:s03']]))
fix('A141-150-D003', 'V', *tri('p143:b003', ('מַלְחֲצַיִם', 'מֶלְחָצַיִם'), ('Malkhatsayim', 'Melkhatsayim')), s('p143:b003', 'translit_ru', 'малхацайим', 'мэлхацайим', 2),
    s('p143:b003', 'he_niqqud', 'הַמַּלְחֲצַיִם', 'הַמֶּלְחָצַיִם', '+'), s('p143:b003', 'translit', 'Hamalkhatsayim', 'Hamelkhatsayim', '+'),
    note='Cyrillic хамалхацайим is covered by the малхацайим replacement (2 occurrences).')
fix('A141-150-D004', 'V', *tri('p148:b001:s02', ('תּוֹצְאַת', 'תּוֹצָאַת'), ("Tots'at", "Totsa'at"), ("тоц'ат", "тоца'ат")))
fix('A141-150-D005', 'V', *tri('p148:b007:s04', ('תּוֹצָאוֹת', 'תּוֹצְאוֹת'), ("Totsa'ot", "Tots'ot"), ("тоца'от", "тоц'от")))
fix('A141-150-D006', 'V', *tri('p148:b006:s03', ('הֶחָרִיצִים', 'הַחֲרִיצִים'), ('Hekharitsim', 'Hakharitsim'), ('хэхарицим', 'хахарицим')))
fix('A141-150-D007', 'V', *flat(*[tri(t, ('לַחָרִיץ', 'לֶחָרִיץ'), ('Lakharits', 'Lekharits'), ('лахариц', 'лэхариц')) for t in ['p142:b003', 'p148:b004:s02']]))
fix('A141-150-D008', 'N', s('p141:b002', 'he_niqqud', 'תַּהֲלִיךְ מִבְחַן', 'תַּהֲלִיךְ מִבְחָן'),
    s('p141:b002', 'he_niqqud', 'הַמִּבְחַן מְאַפְשֵׁר', 'הַמִּבְחָן מְאַפְשֵׁר'),
    note='The two p142/p143 absolute uses are fixed together with A141-150-D001.')
fix('A141-150-D009', 'N', s('p145:b002:s01', 'he_niqqud', 'הֶפְרְשֵׁי', 'הֶפְרֵשֵׁי'))

# --- p151-203 ---------------------------------------------------------------------------------------
fix('A151-203-F001', 'S', s('p152:img01-tens', 'he', 'עמיסת סף מתיחה', 'עמיסת סף במתיחה'),
    *tri('p152:img01-tens', ('מְתִיחָה', 'בִּמְתִיחָה'), ('Metikha', 'Bimtikha'), ('мэтиха', 'бимтиха')))
MAAVAT = (('מְעוּוָּת', 'מַעֲווָת'), ('me’uvat', 'ma’avat'), ('мэ’уват', 'ма’ават'))
fix('A151-203-F003', 'V', *tri('p156:b009', *MAAVAT), s('p156:img01:label:strain', 'he_niqqud', 'מְעוּוָּת', 'מַעֲווָת'),
    s('p156:img01:label:strain', 'translit', 'Me’uvat', 'Ma’avat'), s('p156:img01:label:strain', 'translit_ru', 'мэ’уват', 'ма’ават'))
fix('A151-203-F005', 'S', s('p169:img01:label:liquid', 'he', 'נתוכת ברזל ועם פחמן מומס', 'נתוכת ברזל (עם פחמן מומס)'),
    s('p169:img01:label:liquid', 'he_niqqud', 'בַּרְזֶל וְעִם פַּחְמָן מוּמָס', 'בַּרְזֶל (עִם פַּחְמָן מוּמָס)'),
    s('p169:img01:label:liquid', 'translit', 'barzel ve’im pakhman mumas', 'barzel (im pakhman mumas)'),
    s('p169:img01:label:liquid', 'translit_ru', 'барзэл вэ’им пахман мумас', 'барзэл (им пахман мумас)'))
fix('A151-203-F025', 'R', s('p169:img01:label:liquid', 'ru', '[נתוכת: неуверенное чтение растрового слова] железа и с растворённым углеродом',
                            'Расплав железа (с растворённым углеродом)'),
    s('p169:img01:label:liquid-austenite', 'ru', '[נתוכת: неуверенное чтение растрового слова] железа', 'Расплав железа'),
    s('p169:img01:label:liquid-cementite', 'ru', '[נתוכת: неуверенное чтение растрового слова] железа', 'Расплав железа'),
    *[s(t, 'translit_ru', 'нэтокхэт', 'нэтохэт') for t in ['p169:img01:label:liquid', 'p169:img01:label:liquid-austenite', 'p169:img01:label:liquid-cementite']],
    note='Cyrillic нэтокхэт → нэтохэт fixed in the same three labels (kh written twice).')
fix('A151-203-F007', 'S', s('p198:img01:t-mechanical-properties:r0c7', 'he', 'Endurence', 'Endurance'))
fix('A151-203-F008', 'R', s('p186:b003:s01', 'ru', 'Процесс позволяет увеличить содержание углерода во внешнем слое низкоуглеродистой стали до 0.2%C, так что центр остаётся вязким.',
                            'Процесс позволяет увеличить содержание углерода во внешнем слое низкоуглеродистой (до 0.2%C) стали, так что сердцевина остаётся вязкой.'))
fix('A151-203-F009', 'S', s('p160:t-steel-applications:grade-4340-application', 'he', 'חלקי מנגנונים מיוחדים', 'חלקי מטוסים מיוחדים'),
    *tri('p160:t-steel-applications:grade-4340-application', ('מַנְגְּנוֹנִים', 'מְטוֹסִים'), ('mangnonim', 'metosim'), ('мангноним', 'мэтосим')),
    s('p160:t-steel-applications:grade-4340-application', 'ru', 'детали специальных механизмов', 'специальные детали самолётов'))
fix('A151-203-F010', 'V', s('p160:t-steel-applications:grade-6150-application', 'translit_ru', 'машаэвот', 'маш’эвот'))
fix('A151-203-F011', 'N', *ss(['p160:t-steel-applications:grade-1113-application', 'p160:t-steel-applications:grade-30303f-application'],
                               'he_niqqud', 'אוּמִים', 'אוּמִּים'))
G01 = 'p160:t-steel-applications:grade-o1-application'
fix('A151-203-F012', 'S', s(G01, 'he', 'קשיות […] גבוהה', 'קשיות יחסית גבוהה'), s(G01, 'he_niqqud', 'קַשְׁיוּת […] גְּבוֹהָה', 'קַשְׁיוּת יַחֲסִית גְּבוֹהָה'),
    s(G01, 'translit', 'kashyut [unreadable] gvoha', 'kashyut yakhasit gvoha'), s(G01, 'translit_ru', 'кашйут [неразборчиво] гвоа', 'кашйут йахасит гвоа'),
    s(G01, 'ru', 'с высокой твёрдостью […] и', 'с относительно высокой твёрдостью и'))
fix('A151-203-F013', 'S', s('p159:steel-legend-hardened', 'he', 'אחרי חיסום', 'לאחר חיסום'),
    *tri('p159:steel-legend-hardened', ('אַחֲרֵי', 'לְאַחַר'), ('Akharey', 'Le’akhar'), ('ахарэй', 'лэ’ахар')))
fix('A151-203-F014', 'S', s('p159:steel-legend-cold', 'he', 'מעובד קר', 'מעובד בקר'),
    *tri('p159:steel-legend-cold', ('מְעוּבָּד קַר', 'מְעוּבָּד בְּקֹר'), ('Me’ubad kar', 'Me’ubad bekor'), ('мэубад кар', 'мэубад бэкор')),
    note='בקר pointed בְּקֹר («cold»), the same reading the audit fixed for the identical phrase on p197 (A191-203-F002).')
fix('A151-203-F015', 'V', s('p153:b005:s01', 'translit_ru', 'микорозйах', 'микорозйа'))
AKH = [['בְּאָחוּז', 'בַּאֲחוּז'], ['שֶׁאָחוּז', 'שֶׁאֲחוּז'], ['אָחוּז הַ', 'אֲחוּז הַ'], ['אָחוּז פַּחְמָן', 'אֲחוּז פַּחְמָן']]
fix('A151-203-F016', 'N', {'op': 'rule', 'rule': 'akhuz', 'pairs': AKH},
    note='Applied to every address of the finding; absolute אָחוּז in «אחוז נמוך» is untouched.')
GAV = {'op': 'gavoah'}
F017 = ['p155:b001:s03', 'p156:b003:s02:s02', 'p156:b005:s02', 'p156:b007:s02', 'p162:t-steel-symbols:cell:H-usage', 'p164:b002:s02']
fix('A151-203-F017', 'V', *[dict(GAV, target=t) for t in F017])
fix('A151-203-F018', 'V', s('p157:t-alloying-elements:cell:cobalt-uses', 'translit', 'kirsummim', 'kirsumim'),
    s('p157:t-alloying-elements:cell:cobalt-uses', 'translit_ru', 'кирсуммим', 'кирсумим'))
fix('A151-203-F019', 'R', {'op': 'note', 'id': 'r-a24bf888900dae43cdf5e37f',
                           'from': 'Аббревиатуры טמפ׳/פלב״ם сохранены без произношения.',
                           'to': 'Аббревиатуры טמפ׳/פלב״ם в исходном тексте сохранены; в огласовке и транслитерации даны их полные чтения.'})
hold('A151-203-F020', 'T', 'Linking «мягкость/мягкий материал» needs a new canonical term with independent review; adding unreviewed terms is not allowed by the term contract. Footnote text is present.')
fix('A151-203-F021', 'V', *tri('p154:b002:s02', ('מֵהַחוֹמָרִים', 'מֵהֶחוֹמָרִים'), ('mehakhomarim', 'mehekhomarim'), ('мэхахомарим', 'мэхэхомарим')))
fix('A151-203-F022', 'V', s('p155:img01:label:caption', 'translit', 'be’akhuz', 'ba’akhuz'), s('p155:img01:label:caption', 'translit_ru', 'бэ’ахуз', 'ба’ахуз'),
    s('p166:b002', 'translit', 'be’akhuz', 'ba’akhuz', '+'), s('p166:b002', 'translit_ru', 'бэ’ахуз', 'ба’ахуз', '+'),
    note='Pointing of p155 caption and p166:b002 is changed by the F016 rule.')
fix('A151-203-F023', 'V', {'op': 'rule', 'rule': 'phase'})
fix('A151-203-F024', 'V', *flat(*[[s(t, 'translit', 'hagerger', 'hagarger'), s(t, 'translit_ru', 'хагэргэр', 'хагаргэр')]
                                   for t in ['p169:img01:label:austenite-ledeburite', 'p169:img01:label:austenite-cementite',
                                             'p169:img01:label:pearlite-ledeburite', 'p169:img01:label:pearlite-cementite']]))
E26 = 'p170:img01:label:eutectoid'
fix('A151-203-F026', 'S', s(E26, 'he', 'אוטקטואידית', 'אוטקטואידית-פרליט'), s(E26, 'he_niqqud', 'אוּטֶקְטוֹאִידִית', '⟦אוטקטואידית⟧-פֶּרְלִיט'),
    s(E26, 'translit', 'Utekto’idit', '[unresolved reading: אוטקטואידית]-perlit'), s(E26, 'translit_ru', 'утэкто’идит', '[неразрешённое чтение: אוטקטואידית]-пэрлит'),
    s(E26, 'ru', 'Эвтектоидная', '…-перлит (первое слово в скане не установлено)'),
    note='Only the legible core «-פרליט» is restored; the first word stays explicitly unresolved and is not voiced.')
fix('A151-203-F027', 'V', s('p174:b007:s02', 'translit', 'Hashayat', 'Hashhayat'), s('p174:b007:s02', 'translit_ru', 'хашайат', 'хашхайат'),
    s('p174:img01:label:hold', 'translit', 'Hashaya', 'Hashhaya'), s('p174:img01:label:hold', 'translit_ru', 'хашайа', 'хашхайа'))
fix('A151-203-F028', 'V', s('p175:b002', 'translit', 'bedome לת.ז. shel', 'bedome leteudat zehut shel'),
    s('p175:b002', 'translit', "ad לטמפ' shel", 'ad letemperatura shel'),
    s('p175:b002', 'translit_ru', 'бэдомэ לת.ז. шэл', 'бэдомэ лэтэудат зэхут шэл'),
    s('p175:b002', 'translit_ru', "ад לטמפ' шэл", 'ад лэтэмпэратура шэл'),
    note='Source abbreviations ת.ז./טמפ׳ stay in Hebrew; readings spell them out. המרחשים stays unresolved.')
fix('A151-203-F029', 'R', s('p176:b002', 'ru', 'мартензита', 'мартенсита'))
fix('A151-203-F030', 'N', *[s(t, 'he_niqqud', 'אֲמָצִים', 'אֲמַצִּים', '+') for t in ['p153:b005:s02', 'p165:t-stainless-types:s04']],
    *[s('term:' + t, 'niqqud', 'אֲמָצִים', 'אֲמַצִּים', '+') for t in ['stress-corrosion-cracking', 'residual-stress', 'stress-concentration']])
fix('A151-203-F031', 'N', s('p178:b003:s04', 'he_niqqud', 'הַמְסַגִּים', 'הַמְסָגִים', '+'))
fix('A151-203-F032', 'V', *tri('p179:b002:s02', ("ג'וֹמְנִי", "ג'וֹמִנִי"), ('jomni', 'jomini'), ('джомни', 'джомини')),
    {'op': 'subs_any', 'targets': ['p179:b002:s03', 'term:jominy-distance'], 'pairs': [["ג'וֹמְנִי", "ג'וֹמִנִי"], ['jomni', 'jomini'], ['Jomni', 'Jomini'], ['джомни', 'джомини'], ['Джомни', 'Джомини']]})
fix('A151-203-F033', 'N', s('p183:b011:s01', 'he_niqqud', 'הַשְׁהָיָּיה', 'הַשְׁהָיָיה'), s('p184:b002:s01', 'he_niqqud', 'הַקְשָׁיָּיה', 'הַקְשָׁיָיה'),
    s('term:surface-hardening', 'niqqud', 'הַקְשָׁיָּיה', 'הַקְשָׁיָיה', '+'))
fix('A151-203-F034', 'V', s('p189:b003:s03', 'he_niqqud', 'אֶל בַּרְזֶלִיּוֹת', 'אַל בַּרְזִלִּיּוֹת'), s('p189:b003:s03', 'he_niqqud', 'אֶל ברזיליות', 'אַל ברזיליות'),
    s('p189:b003:s03', 'translit', 'el barzeliyot', 'al barziliyot'), s('p189:b003:s03', 'translit', 'el [unresolved', 'al [unresolved'),
    s('p189:b003:s03', 'translit_ru', 'эл барзэлийот', 'ал барзилийот'), s('p189:b003:s03', 'translit_ru', 'эл [нераз', 'ал [нераз'))
fix('A191-203-F001', 'S', s('p197:img02:composition-heading', 'he', 'weight percent', 'weight precent'),
    note='Exact source spelling «precent» kept in the source field; Russian is already correct.')
fix('A191-203-F002', 'V', *tri('p197:t-product-key:r8c1', ('בְּקַר', 'בְּקֹר'), ('bekar', 'bekor'), ('бэкар', 'бэкор')))
fix('A191-203-F003', 'N', *ss(['p197:img01:t-strain-hardening:r1c1', 'p197:img01:t-strain-hardening:r2c1',
                               'p197:img01:t-strain-hardening:r3c1', 'p201:b002:s04'], 'he_niqqud', 'הַקְשָׁיָּיה', 'הַקְשָׁיָיה'))
fix('A191-203-F004', 'V', *tri('p200:img02:t-applications:r3c1', ('מַאֲפַיְּינֵי', 'מְאַפְיְינֵי'), ("ma'afaynei", "me'afyenei"), ('ма’афайнэй', 'мэ’афйэнэй')))
fix('A191-203-F005', 'V', *tri('p203:b002:s01', ('לַחוֹמָרִים', 'לֶחוֹמָרִים'), ('Lakhomarim', 'Lekhomarim'), ('Лахомарим', 'Лехомарим'), n='+'),
    *tri('p203:b004', ('בַּחוֹמָרִים', 'בֶּחוֹמָרִים'), ('Bakhomarim', 'Bekhomarim'), ('Бахомарим', 'Бехомарим'), n='+'))
fix('A191-203-F006', 'V', {'op': 'rule', 'rule': 'phase'})
hold('A191-203-S001', 'M', 'Legend scan-region coordinates only; text is correct. Separate raster measurement pass.')
hold('A191-203-S002', 'M', 'Bold-emphasis spans inside rows need a span model the reader does not have yet; text unchanged, reading unaffected. Separate pass.')

# --- front matter / publisher -----------------------------------------------------------------------
fix('PUB-FOOTER-S01-READING', 'V', *[{'op': 'set', 'target': 'p1:audit-footer:s01', 'field': f, 'expect': None, 'value': v} for f, v in [
    ('he_niqqud', 'מה"ט - הַמָּכוֹן הַמֶּמְשַׁלְתִּי לְהַכְשָׁרָה בְּטֶכְנוֹלוֹגְיָה וּבְמַדָּע|labor.gov.il|'),
    ('translit', 'Mahat - Hamakhon hamemshalti lehakhshara betekhnologya uvemada|labor.gov.il|'),
    ('translit_ru', 'махат - хамахон хамэмшалти лэхахшара бэтэхнологйа увэмада|labor.gov.il|')]],
    note='מה"ט is read as the acronym «Махат»; the site address stays in Latin.')
for fid in ['PUB-GAP-ACRONYM', 'PUB-GAP-SUBTITLE', 'PUB-GAP-TITLE']:
    hold(fid, 'M', 'Publisher logo repeated on every sheet (609 occurrences). Decision D4: not part of the study layer and not voiced; illegible micro-lines stay a limitation.')

# --- reader UI ----------------------------------------------------------------------------------------
code('UI43-CIRCLED-NUMBERS', 'U', 'Circled numbers ①–⑳ are drawn as plain digits in a ring, independent of the font.')
code('UI62-VECTOR-ARROWS', 'U', 'Combining arrow U+20D7 is drawn as an over-arrow mark, independent of the font.')
code('UI53-PAGE-POSITION', 'U', 'Direct page opening re-anchors after late layout and keeps the page counter in sync.')
hold('UI40-SOURCE-UNDERLINE', 'U', 'Author underline spans are not encoded in the data yet (same span model as A191-203-S002). Separate pass.')
hold('UI42-SOURCE-COLOR', 'U', 'Colour-coded result spans are not encoded in the data yet (same span model as A191-203-S002). Separate pass.')
hold('UI50-SOURCE-CALLOUT', 'U', 'Callout box styling is not encoded in the data yet. Text is present. Separate pass.')
code('UI124-LEXICAL-SPECIMEN', 'U', 'Card disambiguation follows the corrected pointing דֶּגֶם (noun); verified on p124 after the rebuild.')
code('UI124-MORPH-METIKHA', 'U', 'Verified on p124 after the rebuild; context layer already names the noun.')
