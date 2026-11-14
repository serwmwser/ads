import { q, tx } from './db.js';

const DATA = [
  ['United States', ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Francisco', 'Miami', 'Seattle', 'Boston', 'Atlanta', 'Denver', 'Las Vegas']],
  ['Canada', ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg']],
  ['United Kingdom', ['London', 'Birmingham', 'Manchester', 'Glasgow', 'Liverpool', 'Leeds', 'Edinburgh', 'Bristol']],
  ['Ireland', ['Dublin', 'Cork', 'Limerick', 'Galway']],
  ['Australia', ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra']],
  ['New Zealand', ['Auckland', 'Wellington', 'Christchurch']],
  ['Germany', ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Stuttgart', 'Düsseldorf']],
  ['France', ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes']],
  ['Spain', ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Málaga']],
  ['Portugal', ['Lisbon', 'Porto', 'Braga']],
  ['Italy', ['Rome', 'Milan', 'Naples', 'Turin', 'Florence', 'Bologna']],
  ['Netherlands', ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht']],
  ['Belgium', ['Brussels', 'Antwerp', 'Ghent']],
  ['Switzerland', ['Zurich', 'Geneva', 'Basel', 'Bern']],
  ['Austria', ['Vienna', 'Graz', 'Salzburg']],
  ['Sweden', ['Stockholm', 'Gothenburg', 'Malmö']],
  ['Norway', ['Oslo', 'Bergen']],
  ['Denmark', ['Copenhagen', 'Aarhus']],
  ['Finland', ['Helsinki', 'Tampere']],
  ['Poland', ['Warsaw', 'Kraków', 'Łódź', 'Wrocław', 'Gdańsk']],
  ['Czech Republic', ['Prague', 'Brno']],
  ['Hungary', ['Budapest']],
  ['Romania', ['Bucharest', 'Cluj-Napoca']],
  ['Bulgaria', ['Sofia', 'Plovdiv']],
  ['Serbia', ['Belgrade', 'Novi Sad']],
  ['Greece', ['Athens', 'Thessaloniki']],
  ['Cyprus', ['Nicosia', 'Limassol']],
  ['Turkey', ['Istanbul', 'Ankara', 'Izmir']],
  ['Georgia', ['Tbilisi', 'Batumi']],
  ['Armenia', ['Yerevan']],
  ['Kazakhstan', ['Almaty', 'Astana']],
  ['United Arab Emirates', ['Dubai', 'Abu Dhabi', 'Sharjah']],
  ['Israel', ['Tel Aviv', 'Jerusalem', 'Haifa']],
  ['India', ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune']],
  ['Singapore', ['Singapore']],
  ['Japan', ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya']],
  ['South Korea', ['Seoul', 'Busan', 'Incheon']],
  ['Philippines', ['Manila', 'Cebu City', 'Davao']],
  ['Thailand', ['Bangkok', 'Chiang Mai', 'Phuket']],
  ['Indonesia', ['Jakarta', 'Surabaya', 'Bandung']],
  ['Malaysia', ['Kuala Lumpur', 'George Town']],
  ['Vietnam', ['Ho Chi Minh City', 'Hanoi', 'Da Nang']],
  ['South Africa', ['Johannesburg', 'Cape Town', 'Durban']],
  ['Nigeria', ['Lagos', 'Abuja']],
  ['Kenya', ['Nairobi']],
  ['Egypt', ['Cairo', 'Alexandria']],
  ['Brazil', ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador']],
  ['Mexico', ['Mexico City', 'Guadalajara', 'Monterrey']],
  ['Argentina', ['Buenos Aires', 'Córdoba']],
  ['Chile', ['Santiago']],
  ['Colombia', ['Bogotá', 'Medellín']],
  ['Other', ['Other']]
];

function slugify(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function seedWorldGeo() {
  await tx(async (c) => {
    let sort = 0;
    for (const [country, cities] of DATA) {
      sort += 10;
      const code = slugify(country);
      await c.query('INSERT INTO regions(code, name, slug, sort) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING',
        [code, country, code, sort]);
      for (const city of cities) {
        await c.query('INSERT INTO cities(region_code, name, slug, population) VALUES ($1, $2, $3, 0) ON CONFLICT (region_code, slug) DO NOTHING',
          [code, city, slugify(city)]);
      }
    }
  });
  const n = await q('SELECT COUNT(*) AS c FROM regions');
  console.log('Гео (мир): стран ' + n.rows[0].c);
}
