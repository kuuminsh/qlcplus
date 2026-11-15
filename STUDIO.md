# QLC+ Studio: scēnu rediģēšana no planšetes

Šis zars (`studio`) papildina QLC+ 4 ar web lapu, kurā no planšetes vai jebkura cita pārlūka var pārslēgt scēnas un mainīt to kanālu vērtības. Tālāk aprakstīts, kas tika mainīts un kāpēc.

## Problēma

Studijā ir sagatavotas scēnas dažādiem raidījumiem. Ik pa laikam kādu scēnu vajag nedaudz pieregulēt (piemēram, pagriezt key light par 10%), un to gribas darīt no planšetes, nevis no datora pie QLC+.

QLC+ iebūvētā web saskarne to nevar:

- Web API funkcijas (arī scēnas) prot tikai **uzskaitīt, palaist un apturēt** (`getFunctionsList`, `setFunctionStatus`). Komandu scēnas vērtību nolasīšanai vai mainīšanai nav. Tas pārbaudīts arī kodā: failā `webaccess/src/webaccess.cpp` vārds "scene" neparādās nevienu reizi.
- Web lapa piedāvā tikai **Virtual Console** un **Simple Desk**. Simple Desk vērtības uzliek virsū scēnām, bet pašu scēnu nemaina, un pēc tam kanālu nevar "atlaist".
- Trešo pušu rīki strādā caur to pašu API, tāpēc tiem ir tie paši ierobežojumi.
- QLC+ 5 web daļai (`webaccess-qml.cpp`) ir tāds pats komandu komplekts, tātad v5 problēmu neatrisina.

QLC+ kodolā scēnu rediģēt ir vienkārši (`Scene::setValue()`, `Scene::value()`, `Scene::unsetValue()`). Pietrūka tikai tilta starp šīm metodēm un web API.

## Izvēlētā pieeja

Tika apsvērti trīs ceļi:

1. **Neliels QLC+ papildinājums un sava web lapa.** Izvēlēts šis.
2. Sava lietotne, kas glabā scēnas un sūta vērtības caur Simple Desk API. Atmests, jo QLC+ scēnas tad faktiski neizmanto, fade jāraksta pašam, un Simple Desk pārraksta citas funkcijas.
3. Pilnībā sava programma bez QLC+. Atmests, jo ar OpenDMX USB DMX signāla laiku ģenerē dators, un QLC+ šo Windows taimera problēmu jau ir atrisinājis.

1. ceļš saglabā visu, kas QLC+ jau strādā labi (draiveri, fixture bibliotēka, fade, stabilitāte), un pievieno tikai to, kā trūkst. Izmaiņas ir nelielas, tāpēc tās nākotnē var piedāvāt arī oriģinālajam projektam.

## Kas mainīts

| Fails | Izmaiņa |
|---|---|
| `webaccess/src/webaccessstudio.h/.cpp` | **Jauns.** Visa scēnu API loģika: JSON ģenerēšana, vērtību maiņa, Solo, projekta statuss. |
| `webaccess/src/webaccess.cpp/.h` | Jauno komandu pieslēgšana esošajam WebSocket apstrādātājam, īsā adrese `/studio`, saglabāšanas "āķis". |
| `main/main.cpp` | Saglabāšanas funkcijas nodošana web daļai (saglabā esošajā projekta failā). |
| `webaccess/res/studio.html/.css/.js` | **Jauni.** Planšetes lapa. |
| `webaccess/res/CMakeLists.txt`, `webaccess/src/CMakeLists.txt`, `debian/qlcplus.install` | Jauno failu reģistrēšana būvēšanai un instalēšanai. |

Kopā ap 1100 jaunu rindiņu. Esošajā kodā izmaiņu ir ap 140 rindiņu. Esošās funkcijas (Virtual Console, Simple Desk, vecās API komandas) netiek mainītas.

## Jaunās API komandas

Sūta pa WebSocket `ws://<IP>:9999/qlcplusWS` kā `QLC+API|<komanda>|<parametri>`. Atbildes ir JSON formātā.

| Komanda | Ko dara |
|---|---|
| `getScenesJSON` | Visu scēnu saraksts: id, nosaukums, mape, vai skan, fade laiki. |
| `getSceneJSON\|<id>` | Scēnas saturs: ierīces, to kanāli (nosaukums, grupa, krāsa), vai kanāls ir scēnā, vērtība. |
| `setSceneValue\|<id>\|<ierīce>\|<kanāls>\|<0-255>` | Iestata vērtību. Ja scēna skan, izmaiņa notiek uzreiz. Visi pieslēgtie klienti saņem `sceneValueChanged`. |
| `unsetSceneValue\|<id>\|<ierīce>\|<kanāls>` | Izņem kanālu no scēnas. |
| `soloScene\|<id>` | Izslēdz pārējās skanošās scēnas un ieslēdz šo. |
| `getProjectStatus` | Vai projektā ir nesaglabātas izmaiņas. |
| `saveProject` | Saglabā projektu esošajā `.qxw` failā. |

Pilns apraksts ir failā `webaccess/src/webaccessstudio.h`.

## Svarīgākie lēmumi un kāpēc

- **Atsevišķs fails (`webaccessstudio`)**, nevis vēl simtiem rindiņu esošajā `webaccess.cpp`, kas jau tā ir ap 2000 rindiņu garš. Tā izmaiņas ir viegli pārskatāmas, un tās pašas funkcijas vēlāk var pieslēgt arī QLC+ 5 web daļai.
- **JSON atbildes**, nevis QLC+ ierastās virknes ar `|` atdalītājiem. Ierīču nosaukumos var būt jebkuri simboli, JSON ir viegli apstrādājams, un to var izmantot arī citi rīki (Node-RED, Companion, savi skripti).
- **`setValue(..., blind=false, checkHTP=false)`**: `blind=false` nozīmē, ka skanošai scēnai izmaiņa redzama uzreiz. `checkHTP=false` nozīmē, ka vērtība tiek aizstāta, nevis ņemta lielākā, tāpēc slīdni var arī samazināt.
- **Kanālus var mainīt tikai ierīcēm, kas jau ir scēnā.** Jaunas ierīces scēnai pievieno QLC+ datorā. Tas pasargā no nejaušām izmaiņām.
- **Solo režīms**: studijā vienlaikus parasti skan viens setaps, tāpēc pieskaroties scēnai pārējās izslēdzas. To var izslēgt ar slēdzi lapas augšā.
- **Saglabāšana caur `std::function`**: projekta faila nosaukumu zina tikai QLC+ galvenā lietotne, nevis web daļa. Tāpēc `main.cpp` nodod web daļai funkciju, kas saglabā. Ja projekts vēl nekad nav saglabāts, lapa par to paziņo, nevis atver saglabāšanas logu datorā.
- **Piekļuves līmeņi**: ja ieslēgta QLC+ web autentifikācija, scēnu skatīšanai un pārslēgšanai pietiek ar "VC" līmeni, bet rediģēšanai un saglabāšanai vajag "Simple Desk" līmeni.
- **Vairāku klientu sinhronizācija**: katra vērtības maiņa tiek izsūtīta visiem pieslēgtajiem klientiem, tāpēc vairākas planšetes vienmēr rāda vienu un to pašu.
- **Slīdņu ierobežošana**: lapa katram kanālam sūta ne biežāk kā reizi 40 ms. Tas nepārslogo QLC+, kad velk slīdni.

## Planšetes lapa

Adrese: `http://<datora-IP>:9999/studio` (QLC+ jāpalaiž ar `-w`).

- Scēnas sagrupētas pēc QLC+ funkciju mapēm, piemēram, pa raidījumiem.
- Pieskaroties scēnai, tā ieslēdzas un atveras rediģēšanai. Poga ✎ atver scēnu, to neieslēdzot.
- Katram kanālam ir slīdnis un ķeksītis (vai kanāls ir scēnā). Krāsu kanāliem ir krāsaini slīdņi, un pie RGB ierīcēm ir krāsas priekšskatījums.
- Poga "Saglabāt" iekrāsojas, kad ir nesaglabātas izmaiņas.
- Lapa pēc savienojuma pārtraukuma pieslēdzas atpakaļ pati.
- Saskarne ir latviski vai angliski, pēc pārlūka valodas.

## Ierobežojumi

- Strādā tikai ar **QLC+ 4**. QLC+ 5 web daļai vēl nav pieslēgts.
- Ja kanālam noņem ķeksīti, kamēr scēna skan, gaisma patur pēdējo vērtību, līdz scēnu izslēdz un ieslēdz no jauna.
- Ja tajā pašā laikā datorā ir atvērts QLC+ scēnas redaktors tai pašai scēnai, tas var nerādīt web izmaiņas, kamēr to neaizver un neatver no jauna.
- Slīdņu izmaiņas tiek pielietotas uzreiz, bez fade. Fade laiki, pārslēdzot scēnas, strādā kā parasti.

## Pārbaudes

- [x] Web lapa notestēta pārlūkā ar QLC+ API imitāciju: scēnu saraksts, Solo, slīdņi, saglabāšana. Konsolē kļūdu nav.
- [x] GitHub Actions: kompilējas Linux, macOS un Windows (v4 un v5), QLC+ automātiskie testi iziet.
- [x] Windows instalators uzinstalējas un palaižas, web lapa atveras.
- [ ] Tests ar īstu OpenDMX USB un gaismām studijā.
- [ ] Tests no planšetes (pieskārieni, miega režīms, atkārtota pieslēgšanās).

## Turpmākās idejas

- Pēc testiem studijā: saskarnes uzlabojumi pēc reālās lietošanas pieredzes.
- Pieslēgt tās pašas komandas QLC+ 5 web daļai.
- Apsvērt pull request oriģinālajam projektam (mcallegari/qlcplus), kad izmaiņas ir pārbaudītas praksē.
