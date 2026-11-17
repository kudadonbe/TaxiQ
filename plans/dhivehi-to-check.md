# Dhivehi to check

Every UI string added or changed since `v2.6.0`, English beside Dhivehi, so the Dhivehi can be
checked in one pass. Fix a label in the app with the translation editor (the pencil button in the
header), or in `src/i18n.tsx`. Made by `node scripts/list-dv.mjs v2.6.0 > plans/dhivehi-to-check.md`.

48 strings.

| Key | | English | Dhivehi |
| --- | --- | --- | --- |
| `ownMap` | new | 'TaxiQ map' | 'TaxiQ ގެ މެޕް' |
| `worldKinds` | new | { mosque: 'Mosque', school: 'School', hospital: 'Hospital', clinic: 'Clinic', harbour: 'Harbour', jetty: 'Jetty', shop: 'Shop', fuel: 'Fuel station', gov: 'Government office', park: 'Park', pitch: 'Sports ground', beach: 'Beach' } | { mosque: 'މިސްކިތް', school: 'ސްކޫލް', hospital: 'ހޮސްޕިޓަލް', clinic: 'ކްލިނިކް', harbour: 'ބަނދަރު', jetty: 'ޖެޓީ', shop: 'ފިހާރަ', fuel: 'ތެޔޮ ވިއްކާ ތަން', gov: 'ސަރުކާރު އޮފީސް', park: 'ޕާކު', pitch: 'ކުޅޭ ދަނޑު', beach: 'ގޮނޑުދޮށް' } |
| `figView` | new | 'Map view: 3D or flat 2D' | 'މެޕް ބަލާ ގޮތް: 3D ނުވަތަ ފަށް 2D' |
| `fig3d` | new | '3D' | '3D' |
| `fig2d` | new | '2D' | '2D' |
| `figLook` | new | 'How you look on the 3D map' | '3D މެޕުގައި ތިބާ ފެންނާނެ ގޮތް' |
| `figLookNote` | new | 'Only a simple figure, no photo. Kept on this phone.' | 'ހަމައެކަނި ސާދާ ސިފައެއް، ފޮޓޯއެއް ނޫން. މި ފޯނުގައި ރައްކާވާނެ.' |
| `figColour` | new | 'Clothes colour' | 'ހެދުމުގެ ކުލަ' |
| `figLooks` | new | { plain: 'Simple', 'man-casual': 'Man, shirt', 'man-tshirt': 'Man, T-shirt', 'man-formal': 'Man, formal', 'woman-hijab': 'Woman, hijab', 'woman-libaas': 'Woman, libaas', 'woman-sport': 'Woman, sports hijab', young: 'Young person' } | { plain: 'ސާދާ', 'man-casual': 'ފިރިހެނެއް، ޝާޓު', 'man-tshirt': 'ފިރިހެނެއް، ޓީޝާޓު', 'man-formal': 'ފިރިހެނެއް، ފޯމަލް', 'woman-hijab': 'އަންހެނެއް، ހިޖާބު', 'woman-libaas': 'އަންހެނެއް، ލިބާސް', 'woman-sport': 'އަންހެނެއް، ކުޅިވަރު ހިޖާބު', young: 'ޒުވާނެއް' } |
| `vehTypes` | changed | { car: 'Car', van: 'Van', pickup: 'Pickup', motorbike: 'Motorbike', ebike: 'E-bike', bicycle: 'Bicycle' } | { car: 'ކާރު', van: 'ވޭން', pickup: 'ޕިކަޕް', motorbike: 'މޮޓޯބައިކް', ebike: 'އީ-ބައިކް', bicycle: 'ބައިސްކަލު' } |
| `corpusEditorBox` | new | 'Corpus editor' | 'ކޯޕަސް އެޑިޓަރު' |
| `logCleanup` | new | 'Delete log entries older than 90 days and old locations' | '90 ދުވަހަށްވުރެ ބާ ލޮގާއި ބާ ލޮކޭޝަންތައް ފުހެލާ' |
| `logCleaning` | new | 'Deleting…' | 'ފުހެލަނީ…' |
| `logCleaned` | new | (n: number) => (n ? `${n} old records deleted.` : 'Nothing old to delete.') | (n: number) => (n ? `${n} ބާ ރެކޯޑު ފުހެލެވިއްޖެ.` : 'ފުހެލަން ބާ އެއްޗެއް ނެތް.') |
| `logCleanFailed` | new | 'Could not delete. Try again.' | 'ފުހެލެވެން ނެތް. އަލުން މަސައްކަތް ކޮށްލާ.' |
| `wakeWasHidden` | new | "TaxiQ was in the background, so your position and ride requests may have paused. Keep TaxiQ open on screen while you're available." | 'TaxiQ ހުރީ ފަސްބިމުގައި، އެހެންވެ ތިބާ ހުރި ތަނާއި ދަތުރުގެ އެދުންތައް މެދުކެނޑިފައި ހުރެދާނެ. ކުއްޔަށް ލިބެން ހުރިހާ ހިނދަކު TaxiQ ސްކްރީނުގައި ހުޅުވާލާފައި ބަހައްޓާ.' |
| `wakeHint` | new | "Your phone may lock the screen: keep TaxiQ open on screen while you're available, and use a charger." | 'ތިބާގެ ފޯނުގެ ސްކްރީން ލޮކް ވެދާނެ: ކުއްޔަށް ލިބެން ހުރިހާ ހިނދަކު TaxiQ ސްކްރީނުގައި ހުޅުވާލާފައި ބަހައްޓާ، އަދި ޗާޖަރެއް ބޭނުންކުރޭ.' |
| `wakeClose` | new | 'Close' | 'ބަންދުކުރޭ' |
| `dutyUseAsCitizen` | new | 'Use as a citizen' | 'ރައްޔިތެއްގެ ގޮތުގައި ބޭނުންކުރޭ' |
| `dutyBackToRole` | new | 'Back to my role' | 'އަނބުރާ އަމިއްލަ ރޯލަށް' |
| `dutyAsCitizen` | new | 'Using the app as a citizen' | 'އެޕް ބޭނުންކުރަނީ ރައްޔިތެއްގެ ގޮތުގައި' |
| `dutyOff` | new | 'Off duty: no offers' | 'ޑިއުޓީއިން ބޭރުގައި: ދަތުރެއް ނުލިބޭނެ' |
| `dutyOffNote` | new | 'Your taxi keeps its place in the queue but gets no offers.' | 'ތިބާގެ ޓެކްސީ ކިއުގައި އޮތް ތަން ގެއްލިގެން ނުދާނެ، ނަމަވެސް ދަތުރެއް ނުލިބޭނެ.' |
| `dutyGoOn` | new | 'Go back on duty' | 'އަނބުރާ ޑިއުޓީއަށް' |
| `dutyPosition` | new | (n: number, total: number) => `Position ${n} of ${total}` | (n: number, total: number) => `${total} ގެ ތެރެއިން ${n} ވަނަ` |
| `dutyAhead` | new | (n: number) => (n === 0 ? 'No taxis ahead of you' : n === 1 ? '1 taxi ahead of you' : `${n} taxis ahead of you`) | (n: number) => (n === 0 ? 'ތިބާގެ ކުރިން އެއްވެސް ޓެކްސީއެއް ނެތް' : `ތިބާގެ ކުރިން ${n} ޓެކްސީ`) |
| `chipsLabel` | new | 'Show on the map' | 'ޗާޓުގައި ދައްކާނީ' |
| `chipAll` | new | 'All' | 'ހުރިހާ' |
| `chipTaxi` | new | 'Taxi' | 'ޓެކްސީ' |
| `chipBus` | new | 'Bus' | 'ބަސް' |
| `chipPrivate` | new | 'Private' | 'ޕްރައިވެޓް' |
| `chipServices` | new | 'Services' | 'ޚިދުމަތް' |
| `chipNoBuses` | new | 'No buses in this area' | 'މި ސަރަހައްދުގައި ބަހެއް ނެތް' |
| `fullmapEnter` | new | 'Full map' | 'ފުރިހަމަ ޗާޓު' |
| `fullmapExit` | new | 'Show menus' | 'މެނޫތައް ދައްކާ' |
| `fullmapHint` | new | 'Long-press the map or swipe in from the edge to bring the menus back' | 'މެނޫތައް އަނބުރާ ގެނައުމަށް ޗާޓުގައި ދިގުކޮށް ފިތާ، ނުވަތަ ކައިރިން ތެރެއަށް ކާހާލާ' |
| `modelLabel` | new | 'Model' | 'މޮޑެލް' |
| `modelShown` | new | (name: string) => `Model: ${name}` | (name: string) => `މޮޑެލް: ${name}` |
| `modelOther` | new | 'Other / not listed' | 'އެހެން / ލިސްޓުގައި ނެތް' |
| `modelSearch` | new | 'Search make or model' | 'ކުންފުނި ނުވަތަ މޮޑެލް ހޯދާ' |
| `modelNoMatch` | new | 'No model matches. Choose Other / not listed.' | 'މިއާ ގުޅޭ މޮޑެލެއް ނެތް. އެހެން / ލިސްޓުގައި ނެތް ޚިޔާރުކުރޭ.' |
| `modelNote` | new | 'The map draws your vehicle at its real size.' | 'މެޕުގައި ތިބާގެ ވެހިކަލް ފެންނާނީ އޭގެ ހަގީގީ ސައިޒުގައި.' |
| `acctOffer` | new | 'What I offer' | 'އަހަރެން ހުށަހަޅާ ޚިދުމަތްތައް' |
| `acctOfferNote` | new | 'Your vehicles for hire and your services, in one place.' | 'ކުއްޔަށް ދޭ ވެހިކަލްތަކާއި ޚިދުމަތްތައް، އެއް ތަނެއްގައި.' |
| `moreMenu` | new | 'More' | 'އިތުރު' |
| `moreClose` | new | 'Close the menu' | 'މެނޫ ބަންދުކުރޭ' |
| `drivingShort` | changed | "You're on the map for hire (you can't hire a ride yourself now)" | 'ތިބާ މެޕުގައި ކުއްޔަށް ލިބެން ހުރި (މިހާރު ތިބާއަށް ދަތުރެއް ހޯދައެއް ނުލެވޭނެ)' |
| `pinNearRoad` | new | (road: string) => `Near ${road}` | (road: string) => `${road} ކައިރި` |
