'use strict';

function foldName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Aliases exatos de seleções nacionais. Não remove marcadores de gênero/idade,
// para que Alemanha, Alemanha Feminina e Alemanha Sub-21 continuem distintas.
const NATIONAL_TEAM_ALIASES = new Map();
function addCanonical(canonical, aliases) {
  for (const alias of [canonical, ...aliases]) NATIONAL_TEAM_ALIASES.set(foldName(alias), canonical);
}
addCanonical('netherlands', ['paises bajos', 'países bajos', 'paises baixos', 'países baixos', 'holanda', 'holland', 'the netherlands', 'nederland', 'nederlandse']);
addCanonical('germany', ['alemania', 'alemanha', 'deutschland', 'germania']);
addCanonical('spain', ['españa', 'espana', 'espanha', 'espagne']);
addCanonical('france', ['francia', 'frança', 'frankreich']);
addCanonical('england', ['inglaterra', 'angleterre']);
addCanonical('belgium', ['bélgica', 'belgica', 'belgië', 'belgique']);
addCanonical('turkey', ['turquía', 'turquia', 'türkiye', 'turkiye', 'turchia']);
addCanonical('belarus', ['bielorrusia', 'bielorrússia', 'belorussia']);
addCanonical('cyprus', ['chipre', 'kypros']);
addCanonical('armenia', ['armenia']);
addCanonical('italy', ['italia', 'itália', 'italien']);
addCanonical('croatia', ['croacia', 'croácia', 'hrvatska']);
addCanonical('poland', ['polonia', 'polônia', 'polska']);
addCanonical('sweden', ['suecia', 'suécia', 'sverige']);
addCanonical('norway', ['noruega', 'norge']);
addCanonical('finland', ['finlandia', 'finlândia', 'suomi']);
addCanonical('denmark', ['dinamarca', 'danmark']);
addCanonical('switzerland', ['suiza', 'suíça', 'schweiz', 'suisse']);
addCanonical('austria', ['österreich', 'osterreich', 'áustria']);
addCanonical('greece', ['grecia', 'grécia', 'ellada']);
addCanonical('serbia', ['sérvia', 'servia', 'srbija']);
addCanonical('romania', ['rumania', 'romênia', 'românia', 'românia']);
addCanonical('czechia', ['republica checa', 'república checa', 'czech republic', 'cesko']);
addCanonical('scotland', ['escocia', 'escócia']);
addCanonical('wales', ['gales', 'país de gales', 'pais de gales']);
addCanonical('ireland', ['irlanda', 'eire']);
addCanonical('northern ireland', ['irlanda del norte', 'irlanda do norte']);
addCanonical('iceland', ['islandia', 'ísland']);
addCanonical('slovakia', ['eslovaquia', 'slovensko']);
addCanonical('slovenia', ['eslovenia', 'slovenija']);
addCanonical('hungary', ['hungria', 'hungría', 'magyarország']);
addCanonical('bosnia and herzegovina', ['bosnia', 'bosnia y herzegovina', 'bosnia e herzegovina']);
addCanonical('ukraine', ['ucrania', 'ucrânia']);
addCanonical('albania', ['albania', 'shqiperia']);
addCanonical('moldova', ['moldavia', 'moldávia']);
addCanonical('montenegro', ['montenegro', 'crna gora']);
addCanonical('north macedonia', ['macedonia del norte', 'macedônia do norte', 'north macedonia']);
addCanonical('luxembourg', ['luxemburgo', 'luxembourg']);
addCanonical('liechtenstein', ['liechtenstein']);
addCanonical('san marino', ['san marino']);
addCanonical('andorra', ['andorra']);
addCanonical('malta', ['malta']);
addCanonical('estonia', ['estonia', 'estônia', 'eesti']);
addCanonical('latvia', ['letonia', 'letônia', 'latvija']);
addCanonical('lithuania', ['lituania', 'lituânia', 'lietuva']);
addCanonical('portugal', ['portugal']);
addCanonical('brazil', ['brasil', 'brazil']);
addCanonical('argentina', ['argentina']);
addCanonical('united states', ['estados unidos', 'usa', 'eeuu', 'états unis', 'united states of america']);
addCanonical('mexico', ['méxico', 'mexico']);
addCanonical('japan', ['japão', 'japon', 'japan']);
addCanonical('south korea', ['coreia do sul', 'corea del sur', 'south korea', 'korea republic']);
addCanonical('morocco', ['marrocos', 'marruecos', 'morocco']);
addCanonical('egypt', ['egito', 'egipto', 'egypt']);
addCanonical('senegal', ['senegal', 'sénégal']);
addCanonical('ivory coast', ['costa do marfim', 'costa de marfil', 'ivory coast', 'cote d ivoire']);
addCanonical('nigeria', ['nigeria', 'nigéria']);
addCanonical('cameroon', ['camarões', 'camerun', 'cameroun', 'cameroon']);
addCanonical('south africa', ['áfrica do sul', 'africa do sul', 'sudafrica', 'south africa']);
addCanonical('australia', ['austrália', 'australia']);
addCanonical('new zealand', ['nova zelândia', 'nueva zelanda', 'new zealand']);
addCanonical('russia', ['rusia', 'rússia', 'россия', 'russian federation']);
addCanonical('chile', ['chile']);
addCanonical('colombia', ['colômbia', 'colombia']);
addCanonical('peru', ['perú', 'peru']);
addCanonical('paraguay', ['paraguai', 'paraguay']);
addCanonical('uruguay', ['uruguai', 'uruguay']);
addCanonical('ecuador', ['equador', 'ecuador']);
addCanonical('bolivia', ['bolívia', 'bolivia']);
addCanonical('canada', ['canadá', 'canada']);
addCanonical('costa rica', ['costa rica']);
addCanonical('panama', ['panamá', 'panama']);
addCanonical('honduras', ['honduras']);
addCanonical('guatemala', ['guatemala']);
addCanonical('el salvador', ['el salvador']);
addCanonical('jamaica', ['jamaica']);
addCanonical('haiti', ['haití', 'haiti']);
addCanonical('united arab emirates', ['emirados arabes unidos', 'emiratos arabes unidos', 'uae']);
addCanonical('saudi arabia', ['arabia saudita', 'arábia saudita', 'saudi arabia']);
addCanonical('iran', ['irã', 'iran']);
addCanonical('iraq', ['iraque', 'irak', 'iraq']);
addCanonical('qatar', ['catar', 'qatar']);
addCanonical('china', ['china pr', 'china']);
addCanonical('thailand', ['tailândia', 'tailandia', 'thailand']);
addCanonical('vietnam', ['vietnã', 'vietnam']);
addCanonical('democratic republic of the congo', ['rd congo', 'rdc', 'república democrática do congo', 'republica democratica del congo', 'congo dr']);
addCanonical('republic of the congo', ['congo', 'republica do congo', 'república do congo', 'congo republic']);

function normalizeNationalTeamName(value) {
  let key = foldName(value);
  key = key.replace(/^(?:seleccion de|seleccion|selecao de|selecao|national team|equipo nacional de|equipo nacional|equipe nacional de|equipe nacional)\s+/i, '').trim();
  const markers = [];
  if (/\b(?:women|woman|femenina|femenino|feminina|feminino|femmes|femme|ladies|dames)\b/.test(key)) markers.push('women');
  key = key.replace(/\b(?:women|woman|femenina|femenino|feminina|feminino|femmes|femme|ladies|dames)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const youth = key.match(/\b(?:u|under|sub)\s*-?\s*(15|16|17|18|19|20|21|22|23)\b/);
  if (youth) markers.push(`u${youth[1]}`);
  key = key.replace(/\b(?:u|under|sub)\s*-?\s*(?:15|16|17|18|19|20|21|22|23)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const canonical = NATIONAL_TEAM_ALIASES.get(key);
  return canonical ? [canonical, ...markers].join(' ') : '';
}

module.exports = { foldName, normalizeNationalTeamName };
