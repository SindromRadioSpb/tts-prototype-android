"""Reader-facing text for the atlas screen, made from the supplier's content at build time.

The supplier (dots) writes notes for two audiences at once: the reader and the editor/owner who
checks the pipeline. The reader screen keeps the reader's sentences and moves the pipeline ones
(field names, extractor and validator talk) into a separate editor panel. Internal object ids
(f03, b005) and the word "report" are replaced with words a reader can follow.
Acceptance report R03/R04/R06 (docs/research/engineering-atlas/acceptance/).
"""
import re

# Words that only make sense to someone who knows the data contract or the pipeline.
TECH = re.compile(
    r'(?<![A-Za-z])(?:source_text|result_var|display_latex|display|compute|printed|bbox|raw|local_vars|bindings|float|'
    r'angle_unit|he_raw|formula-ID|ID|Source|crop|core|kind_guess|parent|target|page-parent|step\d*)(?![A-Za-z])'
    r'|ядр[оаеу]\b|экстрактор|валидатор|вырезк|редакционн\w* имя|вычислительн\w* интерфейс|контракт|пилот|кандидат\w*\s*\d+|'
    r'(?<![A-Za-z])[a-z]{2,}_[a-z]{2,}(?![A-Za-z])', re.I)

SPLIT = re.compile(r'(?<=[.!?;])\s+')
ABBREV = re.compile(r'(?:^|[\s(])(?:см|с|стр|рис|табл|т\.е|т\.к|др|ср|напр|прим)\.$', re.I)


def _parts(text):
    """Sentences and ';' clauses; an abbreviation or a lowercase Cyrillic continuation does not end one."""
    out = []
    for piece in SPLIT.split(text):
        if out and (ABBREV.search(out[-1]) or re.match(r'[а-яё\d]', piece) and not out[-1].endswith(';')):
            out[-1] += ' ' + piece
        else:
            out.append(piece)
    return out

KIND_FORMS = {
    'f': {'nom': ('формула', 'формулы'), 'prep': ('формуле', 'формулах'), 'acc': ('формулу', 'формулы')},
    'b': {'nom': ('текст', 'фрагменты текста'), 'prep': ('тексте', 'фрагментах текста'), 'acc': ('текст', 'фрагменты текста')},
}
WORDS = {
    'report': {'nom': 'заметки редактора к странице', 'prep': 'заметках редактора к странице', 'acc': 'заметки редактора к странице'},
    'erratum': {'nom': 'предлагаемое исправление', 'prep': 'предлагаемом исправлении', 'acc': 'предлагаемое исправление'},
    'region': {'nom': 'отметка на рисунке', 'prep': 'отметке на рисунке', 'acc': 'отметку на рисунке'},
}
ID = r'[bf]\d{2,3}'
REF = re.compile(r'(?:(?:[сС]|стр)\.\s?(\d{1,3})[:\s]*)?(?<![A-Za-z0-9_])(' + ID + r'(?:\s*[/,–-]\s*' + ID + r')*)(?![A-Za-z0-9_])')
WORD = re.compile(r'(?<![A-Za-z_])(report|erratum|errata|region)(?:\s*/\s*(report|erratum|errata|region))?(?![A-Za-z_])', re.I)
GLUE = [(re.compile(r'(?<=[а-яё])(?=[0-9A-Z\[])'), ' '), (re.compile(r'(?<=[а-яё]:)(?=\S)'), ' ')]


def unglue(text):
    """Supplier notes often lose the space between a word and a number or symbol: «гарантии30», «допускаA»."""
    for pattern, space in GLUE:
        text = pattern.sub(space, text or '')
    return text


def _case(before):
    if re.search(r'(?:^|[\s(])во?\s*$', before):
        return 'prep'
    if re.search(r'(?:^|[\s(])см\.?\s*$', before, re.I):
        return 'acc'
    return 'nom'


def _glue(before, word):
    """Supplier text sometimes glues a word to the id ("вb003"): restore the space."""
    return ' ' if before and not before[-1].isspace() and before[-1] not in '([«' else ''


def rewrite_refs(text, page, here_y=None, positions=None):
    """Replace object ids and pipeline words with reader words.

    page: page number of the text; here_y: vertical position of the text on its page;
    positions: {'f03': y, 'b005': y} for objects of the same page."""
    if not text:
        return text
    positions = positions or {}

    def ref(m):
        before = m.string[:m.start()]
        ids = re.findall(ID, m.group(2))
        forms = KIND_FORMS[ids[0][0]][_case(before)]
        word = forms[1 if len(ids) > 1 else 0]
        on_page = int(m.group(1)) if m.group(1) else page
        if on_page != page:
            where = f' на с. {on_page}'
        elif here_y is not None and ids[0] in positions:
            where = ' ниже' if positions[ids[0]] > here_y else ' выше'
        else:
            where = ' на этой странице'
        return _glue(before, word) + word + where

    def word(m):
        before = m.string[:m.start()]
        case = _case(before)
        name = lambda w: WORDS['erratum' if w.lower() == 'errata' else w.lower()][case]
        out = name(m.group(1)) + (' и ' + name(m.group(2)) if m.group(2) else '')
        return _glue(before, m.group(1)) + out

    return WORD.sub(word, REF.sub(ref, text))


def split_note(text):
    """(reader text, editor text): sentences and clauses with pipeline words go to the editor."""
    if not text:
        return '', ''
    reader, editor = [], []
    dropped = True  # a clause that follows a removed one starts a sentence of its own
    for part in _parts(unglue(text.strip())):
        if TECH.search(part):
            editor.append(part)
            dropped = True
            continue
        if reader and reader[-1].endswith(';') and dropped:
            reader[-1] = reader[-1][:-1] + '.'
        reader.append(part[:1].upper() + part[1:] if dropped else part)
        dropped = False
    out = ' '.join(reader).strip()
    if out.endswith(';'):
        out = out[:-1] + '.'
    return out, ' '.join(editor).strip()


FUNCS = {'sin', 'cos', 'tan', 'tg', 'cot', 'ctg', 'ln', 'log', 'exp', 'sec', 'csc'}
GREEK = {'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa',
         'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
         'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega'}


def pretty_symbol(latex):
    """An editorial variable name written as a symbol (sin_alpha -> \\sin\\alpha); None when it is not one."""
    text = (latex or '').strip()
    if '\\' in text or not re.fullmatch(r'[A-Za-z]+(?:_[A-Za-z0-9]+)+', text):
        return None
    parts = text.split('_')
    if parts[0] in FUNCS and len(parts) >= 2 and parts[1] in GREEK:
        base, rest = '\\' + parts[0] + '\\' + parts[1], parts[2:]
    elif parts[0] in GREEK:
        base, rest = '\\' + parts[0], parts[1:]
    else:
        return None
    if not rest:
        return base
    sub = ','.join('\\' + p if p in GREEK else (p if len(p) == 1 or p.isdigit() else '\\text{' + p + '}') for p in rest)
    return base + '_{' + sub + '}'


RELATION = re.compile(r'=|\\[lg]eq?\b|\\approx|\\neq|<|>|\\le|\\ge')


def formula_with_result(latex, result_latex):
    """Formula whose crop holds only the right-hand side gets its result symbol back: a/c -> sin α = a/c."""
    if not latex or not result_latex or RELATION.search(latex):
        return None
    return result_latex + '=' + latex
