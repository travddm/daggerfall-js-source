// SLAM8: RELAY_VERSION CANNOT BE FORGOTTEN AGAIN.
//
// The line above `RELAY_VERSION` has said "Bump it with every relay-changing slice" since WORLD1, and SLAM5 changed
// the relay's hello path - the 130-player wall - and left it at `world67`. So `world67` named BOTH the relay that
// stops an event at 130 players and the one that does not, and `/health` is the only pre-flight check this port has
// on event day: the relay is deployed by hand and nothing in CI deploys it.
//
// A hand-maintained constant beside a comment asking politely will be forgotten again; that is what a comment is.
// So the version is bound to the LAW ITSELF here. `server/src/index.js` is the relay and `src/net/wire.js` is the
// law it runs (re-exported by server/src/relay.js), and a change to either is a change to what a deployed worker
// does. Change one of those files and this pin fails until a NEW version with its own hash is added below - and it
// has to be new, because the old version's recorded hash is the old bytes and stays that way.
//
// This deliberately fires for a comment-only edit too. `/health` answers "is the worker running the bundle I built?",
// and a bundle whose comments differ is a different bundle; a version that is only sometimes trustworthy is the
// thing that just cost us.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { graph } from '../importGraph.mjs';   // ACC4: the walk moved to a helper so the ACCOUNT Worker's deploy filter is held to its own graph by the same law
import { RELAY_VERSION } from '../../src/net/wire.js';   // LOCALDEV1: the worker entry exports handlers alone

/** SLAM13 (AUDIT SLAM, final lens): THE LAW IS THE WHOLE BUNDLE, not two files. wrangler bundles every relative import
 *  the worker reaches - server/src/relay.js, src/net/wire.js and, since ONCRASH1, src/world/mat4.js (wrapAngle, which
 *  poseChanged and validPose run on every pose) - and an edit to any of them is a different deployed worker under the
 *  same name. So from world73 on the hash walks the import graph from server/src/index.js: every relative `from '...'`,
 *  depth first, each file once, in the order the imports are written. A file joining the graph changes the hash too,
 *  which is the point - a new import is a new bundle. Rows before world73 were sha256(index.js + wire.js) and stay
 *  as recorded: they are facts about bytes already deployed, under the hash law of their day. */
export const RELAY_GRAPH = graph('server/src/index.js');

/** A version bump is `sed world<N>/world<N+1>` over nine test files - RUN IT WITH THIS FILE EXCLUDED, or it
 *  rewrites a row's KEY and relabels bytes already deployed (AUDIT SLAM / SLAM9 did exactly that, and this pin caught it).
 *  Every relay this repo has shipped a law for, and the sha256 of its law that IS it (see `graph` for what the law is).
 *  Append; never edit an existing row - an old row is a historical fact about bytes that have already been deployed. */
const LAW = {
  world277: '9f06f4c2c532d3d9d0183ea19f5bf4f81de59c34c9ca39925bcb6743c5ed8551',
  world278: '44c9edab2ddeebe8c51c60afe58f252591f818d153a87c7b963757062961e975',
  world279: 'a9cee55aa119c72c2377f9edea416ffd31714b9e2184731cf89673271f30a06b',
  world276: '082554ed19550c4884cb8d45ccd412686346f3e080de9e3bbaf39365c094af07',
  // Unpublished TESA release used world274 / e1322ca57f57dd2850fb61e0c55f2b8bb8770f2e4b75dcca0fc24a2fb972a464 (ASHFALL1's fold, re-hashed in place; bytes b90c2080... before it) before the seventh merge of main renumbered it world275, past LADDER-CUT's world274
  // Unpublished TESA release used world272 / 1e218ca29a46a8bac663c7b8a1d9e87097ead7d43f79d535c961a811656bf3b6 (the third merge of main, ecf9b257ea) before the fourth merge of main renumbered it world274
  // Unpublished TESA release used world271 / c3290cb40ff9fb8f183f39835dceaff1ca93615519b700055b44439c84694938 (the second merge of main, 202664fdc5) before the third merge of main renumbered it world272, past MASTER-THREE's world271.
  // Unpublished TESA release used world270 / a4449b7bbaa13ec084fd3121bcb318d732a777a9008f5f901e6649d381e4dc48 (the first merge of main, a367d9045a) before the second merge of main renumbered it world271, past CHAT-POST's world270.
  // Unpublished TESA release used world269 / 7911e57099f437c210381f11770b0a808fb69f4300e157f01af3a05366d20af4 and world270 / bc1cead9bef9573428db5b48a70a451838e802059319c09e9ef37882ebbd3ef0 before the merge of main folded them into world270, past BOW-TOPS's world269.
  // Unpublished PVP-EASE branch used world269 / fbaf5bd410a707de47717c2f6369ab07b014688df73df46c1462e1c4271781fc and world268 / 8e90bd322058c3d70c6aca229c45062a1283cfa689ce74ee61f1c3bc19281f56 before its fold into #1184 renumbered it world270.
  world274: 'd6ac01e610c057e7bbf3368802fb49e0683d4c119e4e11d0a6e708dbcf6fba68',
  world275: '0956668f334cc3af9dd82cc13ff3d4fa1578e134af2a63f6eba83ace1b156d89',
  world273: 'eab843adf86fb425c1c46be0854fb044fa395a88efd8de2ff96daef199bcc263',
  world272: '0d43f51bf74c358781d0b158b3b8f51eb94ae281c82aef9bcdad12cfc61550b4',
  world271: 'bd6f0291a388045c2e7b977cf1f89e58747f0ab4e8b1aadb0b7eb0fafc00f542',
  // Unpublished MASTER-THREE branch used world269 / 3770d75da01c1d417beeaf5ea82628ad2c68479b484c592894fedfaadda12a9d, then world270 / 13ccbcc93d7c913e81a13ebad253eee78c821d9867315b8c0489498f6ecf460c and (after the record's rename to 26d, comments only) 65575267765c6660c702bb8d63673b6da86ea89985ff85f9472d9159ba520b29, before the merges renumbered it world271, then abc7ee88... before AUDIT FB1026d II (re-hashed in place, undeployed: its edits to files the bundle reaches, C4's comment over CAST_LEVEL_MAX among them).
  world270: 'c3b4ade27f3e24eca54b6bd017f76c762a566f7bc0404464c2d13f06e6ebea3e',
  world269: 'b0e8a439fc0d2ea9b4b634003a7b2631bdfa3484f8c246e750f38eaac74c556a',
  // Unpublished TESA release used world268 / 64ce2280842839ba2c2fed3ba5f4d2622844e7bb535e27126d223c2a9463335a (the release's first merge of main, 27a58c6ef7) before the second merge renumbered it world269.
  // Unpublished TESA release used world266 / ea0b896b46d6676a20874f235eb1357bb9f0fbfe016e088f7ca86a6cb40ca1e9 (the R3 trial merge, 2026-10-26) before the merge renumbered it world268.
  // Unpublished TESA branch used world260 / 40db7a4ccd60f16e8530f6b6181ee8fa8bff7ce77c5a85d055f978577a2eafc9 (bffbdd3d... before AUDIT RELEASE R2 re-hashed it in place) before the merge of main renumbered it world266, past THE FOLD's world260, EVENT-RULES' world261, HIBERNATE's world263, REWARD-KILLS' world264 and GATE-COURTS' world265.
  // Unpublished WORLD-WIDE branch used world254 / 90246f66c76e9ebb17c75f18aa871c03a61ed68d2a6981f47115ab3f6c9ebdbd (WW2) and world255 / 34a43f897de85bbf572567e1cc0b7bc64559a7f4ef16ce75299686b4da682f91 (WW-R, re-hashed in place for WW-C2) before this merge renumbered them into world256.
  // Unpublished TESA branch used world256 / a199e4559e0cb48f1bb999b7cb0522a373ac0548bf840d924e4718c751c8bd84 (the fold, before main's KETCH) and world255 / 9cc27d321d98dad2d85a339a8828fd4c14e41fa7553bce56ab4fb8cd0e0b82e9 (AUDIT TESA-BIOME) before the merge with main renumbered it into world256, past KETCH's world255.
  // Unpublished DOMAINS branch used world256 / 35cb323d0022cb299dd21cdb61564c5eaf7fed4696c77e57f8cd17f106953136 (DOMAIN2, world255 on its branch before its merge with main) and TESA's head world256 / d1321dedbfc23620ccfb3452260322987b2ed0cd0234a05754e97c96f468a035 before DOMAINS merged into #1184 and the two became one release.
  // WW7-3 re-hashed world256 in place before its deploy (516155580832a6ca... the composed release's): the seats past the Bay - the provinces' crowns (net/kingdomLaw.js), their glyphs (net/identityToken.js GLYPHS), the seat law's regions and pixels (net/townSeatLaw.js).
  // WW7-4 re-hashed it again (750d9a71401278ce... WW7-3's): the guild arm's rooms the provinces' capitals' castles too (net/instanceRoom.js PROVINCE_CASTLE_MAP_IDS).
  // WW7-5 re-hashed it again (f6bb05fdde25ebd6... WW7-4's): the Watch's ground the world's grid but the Veil's box (net/watchReceipt.js watchPixelOk) - the relay mints a receipt past the Bay.
  // Unpublished TESA branch used world256 / d1321dedbfc23620ccfb3452260322987b2ed0cd0234a05754e97c96f468a035 (the fold past KETCH) before the merge with main renumbered it into world260, past STAFF-EVENT's world256, STAFF-EVENT BOSS's world257, KETCH-LONGER's world258 and ASK-LONGER's world259.
  world268: '9526fc08fea9df415e14d1998d03703fc8b3460009b668b59913d3457040ca5d',
  // Unpublished NIRNROOT-SAGE branch used world267 / 89642bf686dd761c14a5817178f068700600f198519bf47ea33e96450c09d286 before this merge renumbered it world268.
  world267: '919c3539ff3988f11e9f087ba91b87cf08ffcbc7ffb63d6c9a4a3a678c3d8e49',
  world266: '0d2474063f9bcd993da56333d1179b051e9b4d39cd8ab3f253613d64beb40335',
  // Unpublished AUDIT KETCH II branch used world265 / f0a906447fb220fcd15709a03ffe748417d627c99784fe188d00b84c6b443a8c before this merge renumbered it world266.
  world265: 'ff5b67feefd790b51982acbf4f5fd87271b5712ca4aa8d9ffc00a360515d37ce',
  world264: '2a93098229b130dd0f30e7356d75f4a680d0c38740100b89d84199a98ce47361',
  // Unpublished REWARD-KILLS branch used world258 / 64200011595ac4ab590b03defea0b6206cede2ddfa6afe8d3cce0f241e3b5dc1 and world262 / 86704c8e7b486ca55d8b13f648b7be4396b1fc23749c05d81c8f7546b3cfce1f before the merges renumbered it world264.
  world263: '2b19647016a1e7532ae013e2cfd765615e8ba0f5a14b5e6469f025b71ed05e98',
  // Unpublished HIBERNATE branch (#1275) used world260 / 0c1da441011fd75fbea88dcbbb538340d1f1e8d5973e0b1d361e27c951626c9d and world261 / 8b767c5f18370946426e48cfa0d8acdd2e2a61ad7a48917630880e874c064eaf and world261 / 5398dbe13197833c9a094e26e934aceabae39e4c7691b6a4e231d0ba25047742 (after THE FOLD) before it was renumbered past THE FOLD's world260, #1281's world261 and #1238's world262.
  world261: '5d850279a4c6a1744bee03a9de1df5984b064c714dadcf3942b28672247ae1b0',
  // Unpublished EVENT-RULES / BOSS-TRAITS / RAID5 branch used world260 / 7f61d60ecfb8562517f9fb241c948732d37459b3e44b95ad0979f72358720b7b (re-hashed in place by AUDIT WORLD-EVENTS, never deployed) before this merge renumbered it world261.
  world260: '1070d3b6e13c3cd418a7cbab15fedacd4149adf9040293c159bc8df0a766efd6',
  // Unpublished COST-1 branch used world260 / 4fe723fcd67fb80bb47e407a5fd624900371d5fb3b24763b851f77a142f85d72 before the fold took WILD-REJOIN and COST-2 into the same release.
  // Unpublished WILD-REJOIN branch used world260 / b5563d40d9b7badd785fed6289bb00743fd32aa623d87974ef0f3533b93e496b before the fold took it into COST-1's release.
  // Unpublished COST-2 branch used world261 / b40007d1e521f074616f4a9a223bf8bf9390b2a5012fb4ca42c722805c47e810 (part one) and world262 / 31d8f2bf2076d0412287fc6951d6797b9cedae3b5969484a03d8b045bff2fb3a (part two) before the fold renumbered both world260.
  world259: 'bbd77c40d4ebed878aaa34939b7c1833e1c8628eb332f75fe702e8713d2e1269',
  world258: '1a7a136d18698889a8b54d749f29868bc2b6ede9ee28bf7fc2f53b16212d7aae',
  world256: 'ed4a2bd1904cddd0370e783ab653fec32060dc6b0302f7bd23561caeffae4412',
  world257: 'd062c4de53d9c7969a070b6b2f73b8ec5c858d63e0b1cb85ec34605c7c352ca7',
  world255: 'e4c5eeb578a67b90b18e88c643198c371e73cfd3f3c2c20f69ac6aa148a4e00d',
  world254: 'bcd5999b6deda4cc0f2df783916ba18b8c20526f5371cdac4f2f3c63a7c55fa8',
  world253: 'c54e028fc0821277b31eeec741c385882d3672fa203bb3c350a67ea78c965ec4',
  world252: '8d1296bb37223c3d564cbc9e6ab7336b68fd413c7d54d0affbe2b4f6018c8daf',
  // Unpublished DECK-POSE branch used world250 / b0fdb111f1059fccb8f89b8c9435edbbfa5a748b2d3c1f123c07bfd58b8e81f1 before this merge renumbered it world252.
  world251: 'ea9f4ceba814a6976048b5c8e55540d332ab42c7a2191e925a3d789c29c475bc',
  // Unpublished AUDIT MIXED-PAIR / SPELL-HAND branch used world249 / 12dc9f006fe9e823748439414709036980451903d3934aebcd11b970c8f0c7fa before this merge renumbered it.
  world250: '1e938b8a8a917f091d6fce974461a8b427ccf38667ded90f46162e16d62d8b3f',
  // Unpublished HERALD-CARDS branch used world243 / 74fda38e5118c7bfbaf988ea5b8f7ac101fde5c66c2bfd85b0e46b4584133fd9 (e16246c2... before AUDIT HERALD-CARDS re-hashed it in place) before this merge renumbered it world250.
  world248: '796f8ce938fc59f175b9b0c2979b35eb3b0e5f36cb730c26fee624d252780eef',
  // Unpublished AUDIT EG-FALL branch used world240 / 89a91c15c93f19f4258b18dfc982f865ab065435008d865acc4118e51a5e2937 before this merge renumbered it world248.
  world249: '1fb0097fd9daf621420596c5ddfcbed86d61b3b76c42891b653f69eb9984af1d',
  world247: '5c4c2432ad3e2af6ca36268c136a9d9547ed8ab04f28e7f4829a1ab18ffc0d95',
  world246: 'd10e02e0d906167d0a414230f336703b749b9bdc46e08fe7d1ffd80269895273',
  // Unpublished SEA VENTURES branch used world241 / 9acb315f06fc596bf8a86898bbd5bd48c6666b5413e057b5e88eb817c0e8707d, then world242 / 5ca879ca37b52b640c1dbd01722a4bfd9832dc8e730be81df19cf076d3f7849b, then world245 / 4646e5263544109e0bf9c1d6af8bbdde69b85ca2f075ab5a5a8a113b70ae4040, before the merges renumbered it world246.
  world245: '542ee2c0259837e21c3afa169b365dd2b6d536e72a04735635203a556564dde0',
  // Unpublished AUDIT PISTOLET branch used world242 / c815fec21ba811d0f9cc5766854189b39477125e2ba7136ec0ec9648144cb7d5 before this merge renumbered it world245.
  world244: '64b621d5e7ef149b3fb7eda93548eba2b25a148683b5c1d229cc8c1be5163939',
  // Unpublished SPAWN-THIN branch used world242 / dd274e56755711743abb41ac3bdc4d97db0b44d9300f2d522c18a0d8cf1194a0 before this merge renumbered it world244. Before that, world224 / 1ef0b8131aa89704db8c6ac7a17bd5112c14c0a26d869584958118b3890b907d. That row was first written from a Windows checkout (108dd166... counts each \r); 1ef0b813... is the bytes git stores of the branch's world224.
  world243: '4b610ea83d8ca735b9ebf03f3947c00e39a41be3c4e9bf41ff4c02dee97acb2f',
  world242: '2727196ad6a0283354fda378fddaaafe1bc16eddc932fdeb8b03a2c31328f166',
  world241: 'ac9f937dfc6c2af1feed6bb6a1f8d0bd6e642643a0ba4cdbf43cde8c7aa93d87',
  // Unpublished SD-THROUGH branch used world239 / f19f309c06a564cc1223bc1db0fd73045844d7218d7ca777b398825e7f64c66c before the merge renumbered it world240.
  // Unpublished SD-THROUGH branch used world240 / bd053defaaac4f63e9db6fb47667288e955d2b00ce71135ba003cd5ccf877eec before the second merge renumbered it world241.
  world240: '8e24f14bbabe602a40ae36f4006747f412ac3771b0013da13752681337612764',
  world239: 'e93870ab5c760a583872274376f356f90ca0187c4f8c10b1a29e5fe9b0867e4d',
  world238: 'f7a153bf4e77b692e960b402679b1982e7687101b086e0721a02ede625ae1af7',
  // Unpublished STAR-TUNE branch used world236 / aa1bd95d73aa3219bfcb6a4529f904b0e1f3047384ff3ace5b8613d3e8bdea62 before the merge renumbered it world238.
  // Unpublished STAR-TUNE world238 / adafd425b68429eca191f16a435eb724681f5e1cb90eb9e20f04df0a9e95d2d5 (the merge's) before AUDIT STAR-TUNE re-hashed it in place.
  world237: 'e0b65a604d74da4ce9d24ef795a5211827c8b3a32e37d450434ba89500c334a9',
  // Unpublished FIELD BUGS 2026-10-20f branch used world236 / 4189be1f6cd4be4121c6ad50cf7e8de7683f13514227c8e4c28b1b998bdd0239 before the merge renumbered it world237.
  world236: '7cde40ece7089ed2f51867de274a2f1f5c206a7de28ceef61721dad2a0104670',
  // Unpublished LONE-HERALD branch used world235 / f0f6ac08d9922c641aa45bd7454b3dc0497e9946b0adc436505b42342e679515 before the merge renumbered it world236.
  world235: 'e3d16ac148a2b314d761e537750ba10412ddd3563d0b4b916ec7fea52df2e8f2',
  // Unpublished WITCH1 branch used world231 / 0a3743bd4016cb44ef27bf91eb9c3e23c8243fbf65f5b059f70901c1e917ac9d before the merge renumbered it world233.
  // Unpublished WITCH1 branch used world233 / 87cdb512f67b37c1d1c64f52d6f41be73b22cf3fbd31b8bc91e538bb3647f503 before the merge renumbered it world234.
  // Unpublished WITCH1 branch used world234 / 28dce8e18ee191a6bd3e91a9ef69a81e078c6bf832d9b8d983e6d93f5063ff4d before the merge renumbered it world235.
  // Unpublished STARFALL branch used world233 / 9e1155072dd7844d0cda8e905dfa8ccedc201c638b6a34bc690e059f7d2ff9fb before the merge renumbered it world235; the STARFALL branch's world235 was 2b64028f906c0bc60a219496cf80f4dd4ad379969ee1eb8acf1eacead9387b6b before WITCH1's was folded into the same release.
  world233: 'a1ce2bdfe1641491edcb06d35d4e8c4bfb5b8556a2d9c1910cb224290de6165e',
  // Unpublished SD-SEA branch used world226 / b9a0ab0c100a5850bb4ca893cad6c006214500ff2e7df67f1e666a1a2fe733a7 before the merge renumbered it world228.
  // Unpublished SD-SEA branch used world228 / 6931f052ad0756b7f22fde27cb3a26f39091a458cb06ea11ffc3ad2c2af66a71 before the second merge renumbered it world229.
  // Unpublished SD-SEA branch used world229 / cd40477ae9200e1598e6115181ee04a45174c967e63ea56c28341659fa601adc before the third merge renumbered it world233.
  world232: '657722f1a3b68b50a39af35b334b5e68a2595aaeb7d59120c527d31e68d0c96e',
  // Unpublished FIELD BUGS 2026-10-19f branch used world231 / 02f9bab2cfdc51ca562a07242b52cab65c3eec1da5debfbedd9435a901fda8b7 before the merge renumbered it world232.
  // Unpublished FIELD BUGS 2026-10-19f branch used world230 / 8de9765628fba070869d11c856bebf41652dcbb65194e80fd30c0f0668584dce before the merge renumbered it world231.
  // Unpublished FIELD BUGS 2026-10-19f branch used world229 / 5854b53caf150a7bbef50b9442d2bdae4911de95348a7b4099836c1e45954764 before the merge renumbered it world230.
  // Unpublished FIELD BUGS 2026-10-19f branch used world228 / 5e865de962b8850a0242a2d81b42c14b8649a4bc0dc57df0326166f010546f52 before the merge renumbered it world229.
  // Unpublished FIELD BUGS 2026-10-19f branch used world226 / e7dc9131d1dce02b7df50cafab5cd6249dc800e035e7d68dacf1316053440630 before the merge renumbered it world228.
  world231: '297e37cbfb7e21b665195ff7001bcd972990a5277b11e732810f7cd7bf8905fb',
  world234: '520c20aa5e1fbb202d9478c365de7445642850cfd6ba65b396eb209625442b6b',
  world229: '833de84549bea85b87735c5c9bd816cccef7e153236a6c839014a136e2017b91',
  world227: '385e9cf8fc6353c0a4c1b8083d8923d3d13127b13d74cfa25438252681484a4f',
  world225: 'e9368a3f30372ee5da14bb178cfbd28c173bbc5239ad7591551f3f4f6357954a',
  world222: 'c03849cbc96a8ae7ebe813e6ec0e0280b8165a5c1093ca7d6745c207661e770c',
  world228: 'a86fb6bf7bfc819d0909baf02c653dcb6cfbb5766f6f53ec5327635fbbae178f',
  world221: '8a052221e8483688333ee51636b9948c43727698b6a38eeed4b0d3affd65465d',
  // Unpublished FIELD BUGS 2026-10-18f branch (numbered 18b there) used world219 / 6d6c088ae2257a1fb36f0c03ba0ebe922cf7bfc80faf3662ae19520205292a42 before the merge renumbered it world221.
  world219: '33941e9be6bb313c6dd1c9ba28b44d216d4cb32bdc276e544c3fc50fe2af7a52',
  world217: '57d6824ed80992db006d3b7ad7bc97bdac0a696b1b5a372fa329d26640d337c5',
  world218: '038bec38bba5ae2186b4a466d390d6813e2edb460c004dd03b31a9ad24971b2c',
  world220: '07c36629644b5f01bcfccfc03fd88d2d12f905f9b665fadf077bb9d429dfd2f9',
  world230: '1760226daed2ed93720508389cbe1d0f046e69c16df5190e9d279e634b7b04a7',
  world226: '41718074f64f1a3c5f7f85f3cf3af34220e50d275b9b527c34e7e923161d57e6',
  world224: '33f7666b104a5666d714f5b0193c464e7795115e8a3c1d8999ef0ddf2a9c15d0',
  world223: '53763db7dd70f359d08e11b4c5c21610189810849ac82c6165d1cb57d5056480',
  world214: '30b4648f88accc564a12b8d4ba1cc002b87fb80726a161dbd80a27388258402e',
  world215: '1456db9c92ab7151aa2befca685ee9980657b619a4374c3a2fdbb361fbcd5e92',
  world216: '4e4d67767f5307cd53404234c2366bec6a2562c2c61b099fc65c587949d6b953',
  world213: 'bc02deb42bc594759e3174ab68d1f3fb8f9d589ac3115e301d2402edbb34565f',
  // Unpublished EG-PLAY branch used world212 / f35fdd163925c38de7dc36b6879b74fce181969a6e0b3db2fe68b68a4bebd67e (the last of its in-place re-hashes) before the merge renumbered it world213.
  // Unpublished EG-PLAY branch used world211 / b2d954b12565bbeb3ac8a2d412af623b3b586b981186beb518fe86b5c4ea8984 (the last of its in-place re-hashes) before the merge renumbered it world212.
  // Unpublished EG-PLAY branch used world205 / 36361d9ad7ee2e877c4596b10142023740123abdf3b9fabd9468b4b1c1423e52 (the last of its in-place re-hashes) before the merge renumbered it world206.
  // Unpublished EG-PLAY branch used world203 / 80650492c9b8a73f7e1a46c0493ac6b342e2b5c4280adfc47030211ba708f677 (the last of its in-place re-hashes) before the merge renumbered it world205.
  // Unpublished EG-PLAY branch used world201 / 0e97db02ae47e5abbaf0f3d0c62e70b4c56de57847f24698639c64b706df0cce (the last of its in-place re-hashes) before the merge renumbered it world203.
  // Unpublished EG-PLAY branch used world200 / 6a999dc4534f39214a12a95d73f19921acec752d43cebb1986f8504aa7100488 (the last of its in-place re-hashes) before the merge renumbered it world201.
  // Unpublished EG-PLAY branch used world199 / 041a144b85fda42bf7233e9d6a464a59084b273c7c518c225e1e9bbc760740c3 (the last of its in-place re-hashes) before the merge renumbered it world200.
  // Unpublished EG-PLAY branch used world198 / 613eefa2ac26714e8079cde61e25a52540dc652f19c6bf26633c283ea673e1bf before the merge renumbered it world199.
  // Unpublished EG-PLAY branch used world197 / 92ffa5d0ca62b6d47b4aa04b2c0cf9d83cecececa11b805854562d4c97530992 before the merge renumbered it world198.
  world212: 'da74d1cd9e2e09eabc16270fe56674444a666434ab4eb73261e9f8bce337c9c6',
  // Unpublished GRAVE-PARTY branch used world208 / e44ab16e3dad1095417d1bea93edbfb99bd4adbbdad5f2a38f6b5eab82ecc1cf before it joined REZ-BLOODLINE's world210 on this branch.
  // Unpublished FIELD BUGS 2026-10-16b branch used world208 / 3f321538c82a2fdd6fa431ae73882f29697e8f17513c43046a538d9c719d5547 before the merge renumbered it past main's INSTANCES world208 and WEAPON-GLOW1 world209.
  // Unpublished FIELD BUGS 2026-10-16b branch used world210 / bd1634f4168ab9b8993c1da423194a27b7f7fd153c2ed39bc5de2ebd24e9a51f (the merge's), then bbcc955472bddf86dcdec44b690fdae7f0bbfc98bb42c809ec50f9797f042f1d (GRAVE-PARTY's, re-hashed in place, undeployed) before the merge renumbered it past main's HUB-PULL + DO-ASK world210.
  world211: '4f9100dc12b9ed639c1a20d08db9523824374b93bb96803dfab5aa477751318f',
  // Unpublished TIDY branch used world209 / 67d07796fcf4d26a8439160430a268314945c09c763f3b6f65bf773e84237257 before the merge of main renumbered it world211 (re-hashed in place on the branch - bytes 6a9f771a... before it: TIDY6, the relay's comments name 01-Overview's records by their folders; 2deb4630... before that: TIDY5, its tests by theirs) TIDY2: the relay's own files moved into feature folders - net/gate/, net/wild/, net/arena/, net/siege/, net/superDungeon/, net/serpent/, net/iliac/, net/card/, net/duel/, net/gambit/, net/guild/, net/raid/, net/realm/, net/firmament/, net/peer/ and systems/arena/ - no behaviour moved: the bundle's bytes are its re-based imports and the paths its comments name; the same files, in the same order
  world210: '4e3a0accae573b38a5d8cad626fba8bc4a6897ae05301b3ef4f1add41eddd381',
  // Unpublished HUB-PULL branch used world208 / 048cfcfe5695915a7d8d2e8c308c08d43c2604d4be762c576e77f49af32b92cf before the merge of main renumbered it world209.
  // Unpublished HUB-PULL world209 was 8a9505982e605d6462a4ada8a3ed10ee4c56a16bf082b663dbe736bebcde90d6 before the HUB-PULL audit's fixes (the rs hand-up never awaited by the held poll, a miss retried, the backoff woken, rs said until heard, the outbox's bounds) - never deployed.
  // Unpublished HUB-PULL world209 was eec263b674726611b85ab118f0dcfbadd9c1d567fece9dda56996ea866e99cf6 (after the audit's fixes) before the second merge of main renumbered it world210.
  world209: 'e247915204a9de288d9feecaf727d6b07eeaf179bdb218eefb6a92b31678139f',
  // Unpublished WEAPON-GLOW1 branch used world208 / 35248d7e7a7be5cf758227c27498687e3e2fa6a901249b20e0f2b0b4e9e49b0c before the merge of main renumbered it world209.
  world208: '833d03cb0970a362fcc48718808b2e06fa6987132f5b8aa62c67d6041004a919',
  // Unpublished INSTANCES branch used world206 / cc4c07a2e531f47dfd54abc5ca2c163888124f6732e712b37bd913cd56127de1 before the merge of main renumbered it world207.
  // Unpublished INSTANCES branch used world207 / 2ca091d976aa27ac525a50ec8f927bc1bff2b7c9ca5fd90f0b155454c9486649 before the second merge of main renumbered it world208.
  world207: '152110dbdd38e54d261c13fcd890385633d2ec915453a2fe56e319c02e8229c1',
  // Unpublished FIELD BUGS 2026-10-15c branch used world206 / 373ee3299d6eee135da6321b45793d2bd8ceac95009e0f9dbf3f74878f60e70b before the merge of main renumbered it world207.
  world206: '9b1012319114d08095160e6411407586e73c3f954fdca85cf20eb64ca04d49cd',
  // Unpublished SERPENT5 branch used world205 / 923f6db29c3fc2aa2f31db69dad6c6ff7eba23c3c25947c1d14cd837e60b7847 before the merge of main renumbered it world206.
  world205: '30514dbe39e20ec06b7e3bd2a9f066e856aed47e39cd27f90e609b2f1aaff367',
  // Unpublished FIELD BUGS 2026-10-14 integration used world203 / aab314b71d5d65efaca0fae96229790b5b7bbafbdba1a34ccf08a6cb278d8451 before the merge of main renumbered it world205.
  world204: '70ac8990dda218d2aa6fe7d8d8c4e35b9179f366d57e1a64cd1e7202383b6f74',
  world203: '0555f6703c11fe306b562620f2f698f77d202200f35eae0b313f4600439c91d4',
  world202: 'c8ca39371afbd147605a81f4f3ceaa82edeaf85881c0918fa54982c62da3595e',
  world201: '787b17d9b28f46e86b8a2deed645b6b5ec1168adf48a4af936e24f18e5029598',
  world200: 'd5a1c207133ec337e31a7fd95dc96884214c6d4f871ef43ed380cd9b0644f715',
  world199: '787e357420464c46cd5df2d41ee5e654eadc24f95744d855c003e3fed1499fba',
  world198: 'e59f5325f25d27cc1fb938bef99c90aeabfbf4c8ee001bbcd344bbb437bd98a5',
  world197: '4f0f1e7eff51399b7f31bea0280b778ad051a1cb85d4d9f8d90d52f36f70ccd0',
  world196: 'c742ff336b9cc0b548e647083346257fb8858cc0c97ea824dfd3c968dd57cd03',
  world195: 'f9852bac2a0497acbfb2516fa60fd5443a029ee1acb0b29423162faba93f595a',
  // Unpublished COATS1 branch used world194 / c7c3012522b3423ab8bf505ea3d607c088bec7c61c1aef8eb7bb8e8a966c55b1 before the merge renumbered it world195.
  world194: '323f2daa4092eb34bd1b22dd6503217901a0afac1aac811cfadb4a589fcf81bc',
  world193: 'a895c787d54c023fe60e1e42e6d966981ca3f65d34e6101a19f46b1c7c89f6e1',
  // Unpublished SERPENT4 branch used world192 / 3d15160fd6cb00157c04d8c87582c102df7ec4b295b3967af9046886b94b9346 before the merge renumbered it world193.
  world192: '9e95b3a91a187d8d1b4a594d9b853b01b608d3fea84abe1b495ce0b3f617453f',
  world191: '8312ef7a8f84c0e90a00ae7d84e903a47005141479d24e44cee59f0c47bb4f95',
  world190: 'd2651dbff3fc9d8a2cd9f9530db4520e26860813645d69fab54573a6da5ddc39',
  world189: '3ea6b2d4a60ef4078d9c33c5aaec7f6e212cfa73860c3cc0280ed8260642f628',
  world188: '2e399a1cac446c9c7158536c8a5d6e11d030e2fd01cd8db372a31f230623b9d7',
  world187: 'cec92289caef2aff9d65714bf8a4b2699e1ecf2c1849050b3b22fd2430006ec7',
    // Unpublished WAGONS1 branch used world182 / cfa1abe3b0fc58ca004d7c57afc401a66771dfea77723c755f7ac373c67eb549 before the first merge renumbered it world183,
    // then world183 / 2d44376531baa834318bf059dc880a07dd855fae6c97e6bc5ec7c8ff26e6cfb2 before the second renumbered it world185,
    // then world185 / b1462bc85d659fd9acd858cdb48e7e7f4a1e3c1041a250688ede01fb9a780f4a before the third renumbered it world186,
    // then world186 / 8b19e22b17278c0ca7db26c48a59419b19d6d9b387922dcf3fdf51ec1c296410 before the fourth renumbered it world187.
  world186: '250d7a88f222af94a5e5ca7c26b5eabf3dc4ab38ea5267cbfd81c8a7fcb7a99e',
  world185: '798918c9f74d51f84ef8a90150b8c6c4ac2cf941eedff72df0de1c11e0418328',
  world184: '55da850e26d7f73009766f38ad308c68b4d95c48cd829639f1737d31c38f7bc0',
  world183: '459eacc03b1e77bab80d65104b7cf5bbc24b7c68a6f346782c5d5261aacfd509',
  world182: '11ac9600126f3567fac5a8777a32d1d4397fdc89a200c0b1d3a029cda40b6c9d',
  world181: 'a6336b20dbda2549007cfecbcb1e4246c9a9ae52b2a3e3b76e4bfe12a474a713',
  // Unpublished TV-BEYOND branch used world180 / 9ede155324d04358d44e866ca6aaefb91b62bf05f755971b31d19439c40c6eb4 before the merge renumbered it world181.
  world180: '6a06303e98a9d517135d9443a675ea45817b878be9311a161addbfb2802d5505',
  world179: '2861f9409ad24c82c5a21db3079bdd5adaa8b019e5d9cfc4e88dc95dd2153c39',
  world178: '2056e98e058638a0431714dcf0dca5f4238a77321b0d6ae44cfdeb1c93a930b4',
  world177: 'd60d2b4bd94790689386fa774df8f9f11caf74faf814625e848155cd35fc761f',
  world176: '447ca90ba9d4e89f2ff6bd29fb4c15a36953bf568f0e79c1e9b115383cbb04ae',
  // Unpublished SUPER-DUNGEONS branch used world171 / d9e83936781a68eeec61ae4c799f22fdb2a2f488b8bd85d598b34a42ce477072 (SD-ONLINE, the room per layout) before integration as world172, then world172 / fe7a562b... (that integration) and b247d5fc715cb12c7565941c7c99cd879d563048d79911985c9755c6471ccc62 (SD3) before integration as world175, then world175 / e91371f70a210332c172ce11aca13f80c1b6c9f6120b5908ebdc62f147a5773d (SD6c) before integration as world176; main's CRYSTAL-FIST owns world171, main's WATCH-FIX world172, SERPENT3 world173 and LEGACY7 world174 below.
  world175: 'b4370428f27c81df68b2ee74cbb712dd2298c3eb234744186c00fe1323d86867',
  world174: '64ae4c0aa3f1d56e2801cdb927469bedbb8884d90d1242612613acafc0db8db4',
  // Unpublished LEGACY7 branch used world172 / 41f05e9a222cb5a9f34d9f641f1a502af66639670eea35464412e794757a31c2 (part two), a39edc1edecae50eeae21ac2819048b826f108c59d5c574c31f672cfe5d0c7c4 and f2221791453a9ba9e71bd0e049cc6a79071c605bd07c026d28164ffdb69b6846 (part three) and c922bed97e71ec9b70a2c9bb87f35c17a8d26daa5831a18f2a4e096d1f43e0b9 (AUDIT LEGACY III O1/O11) before integration as world174; main's WATCH-FIX owns world172 and main's SERPENT3 world173 below.
  world173: '76d95b766a4024745e45fcec680e3b414c6f743030db7963a96d4182d07a8d41',
  // Unpublished SERPENT3 branch used world171 / 48e9ebadc523ece91ebc0adb56c4b1dae1b67e61050b459dfc957d5466bb2ad6 before integration as world172, then world172 / aade1273dd5f7233044a1cb302081cb0efb14496cf4bd1b682f62035e43cc8f9 (that integration), 3c7788fa2f8059eb1f553efca003b2bfb5799985f697d951318feb90dc69aea0 and fb2aa5251296c106a174f5f4d0f37bc7149b32ca59c402eaf67653d17d0b4cfc (AUDIT SHIPS) and 296974bb26b3bddefed8de6362a5e5577ab77ca8aab1ef1674d59366b54c9851 (AUDIT SHIPS 2) before integration as world173; main's CRYSTAL-FIST owns world171 and main's WATCH-FIX world172 below.
  world172: 'f6b01791e464e875c23f4c9c54d62df86e80fc6e545a5de7c270290d80889190',
  world171: 'acb8e5c9e661bc55095411c62f933bb25d89d0cbc16230d940a283028a69d9f2',
  // Unpublished CRYSTAL-FIST branch used world170 / e86194eba1873ae3c6b1260c7372c2b2f6dcdced79426e37185663aba210353b, then 66147fd737aee15ea4c719954d73e186cc4d7b82e4cc7344cfd4da6f5b0b8a7d (its AUDIT: the version comment's deploy order) before integration as world171; main's FEUD owns world170 below.
  world170: 'c9b6b2012caa52e37de66af95f57bae78c77282d65c6a830973dcad9081972f8',
  // Unpublished FEUD branch used world162 / c5a2ba290100d4895f4e0336384cf1d5971234d312530cb8774acf726a38a5de (TELL8), world163 / 819c1c53f60a19af93e6c719f43f5932d6625e6ee5846f223a3261fec6310c10 (AUDIT TELL), world164 / 34dc3cb938a85f1c25c4d2382c5d042eb74ef3d64354ff7b3f95ea2ffab257dd (RVN13) and world165 / 94cda8785d3a72fecffe98230d03aae9add67e0657874a9b9ba41cff81926c23 (FEUD WIRE) before integration as world170; main's PRIMARCH, SUNBABY1, PARTY-LEAD and SERPENT1 own those numbers below.
  world169: '3a22ab173a89b68a97e6c7e0aa600617216454c4a672cfaa808d0b39668fa0d0',
  world168: '42d24dbd7629534d0578a2b60e17773caa7985f1e23258e410d62487ef154d0d',
  world167: 'e2c5442b9f61fd573d6a0fd73723463d4e721906b6246cf861851f69bb1d4720',
  world166: '6fee59e1dd606d049b524bbcc7655f564b84eb1cb11b45d9f3664072fe102ca6',
  world165: '06d3f234681b2a1d183cc1ed2ea671ceff1e7d3f7dae97b6c900543cb3759b94',
  world164: 'c804cdd07c115c136a2a09ff72398dfa58bbb83e10a6e9baf30ff0fb13e46387',
  world163: 'c4889ff5080e0a7d448396b46b467a7df4bcfe1c5c06724871952d2a41f8f398',
  world162: '65cf98807fe575971459fea8d5b9cc846678865ecc500b298eb10012721c1e36',
  world161: '97f4a963421ac519626e96956bfbc15a96fc5563972b2c35cbecbed5918b4d1e',
  world160: '8719548088c4ebc9dcc8d51311fabcc8e33fc7df63a6859f416db9c8d7a71354',
  world159: '025f2195a030a7f1363564a45a8535ec30689546bd6d3f4be1f0bfcc4e14521a',
  world158: '0221967fd1a04ad298ad3ab91742aa539a8480604c42a2de0c5cd99a83e8ae6f',
  world157: 'f68acb2e77579a21377c38df85b33c373460e5904d24506c810c1e17c0a552d2',
  // Unpublished boat branch used world156 / 5f43ffe6bf7a59ec9b0660f90ebe14403a9bb1b210adcc25bb3983be51290f2c; upstream's Arena spectator law owns world156 below.
  // Unpublished STAFF-TP branch used world155 / 509b32485526564328f7c338be9d8414e59bfaf36fdf23ea14ad6ffb9f218056 before integration as world157; upstream's Arena owns world155 below.
  world69: '27da57b0787d8e18e93dea8358614d9af2e9c65133774755f39960e0ec8f89de',
  world70: '06cb8eb45de961f9756a71a3cfba19fd84e3a3e7a5217d5e3798e3b11cf4ebed',
  world71: '37bfb4d0bc508775233bcbabbe4bbd7b1b4dc4fccd148e9a17c72fba0dd0e877',
  world72: 'de19e038912ea8e2e0568923bcf398b86ea2c80c173051129c0ece93bf6efa51',
  world73: 'c12e8b6497602a53eead0f4b7abb41a0f6b65be217e174e9ed11c0244a9362ba',
  world74: 'f09ab5bdcc836a30fe540d4558a7d0a6c1c933130d9db4d61d5e86c896b55595',
  world75: '4587d8fa5adbfc5df062feb6831c1d191ac0563b7312d4bff7d311aa00093cac',
  world76: '6f7d8d11d5c055d02fadc70935d9951b3c99732f8b59c9f9f4b72363b873781f',
  world77: 'b8daad37e99a5f42c73910a000a44c3cca5d82c955cfed8bb064c10239e6aa60',
  world78: '059dda8d32a6e836c44d67cb2a81e969f7d9f15468e60262f57798b37c083ec6',
  world79: '1ce0aa5a1a3080a2ce121be6e9bb832cd4f5a0312dd47bb18963aebfacd03a6a',
  world80: 'fc02a655c311d19778d026248c77d6a2f85bf25888865942e0520164db7bac8d',
  world81: '38878bdb5febe591e819830f195ef68f75a620930f4f35d08e18984887559328',
  world82: '2c97add60a97d56f949ce6af4f8bba4947a862ad75183c578803c1c62864325a',
  world83: '30d4fd6bb7a536b22ff0c01c08db137026181e39d0222b3607db30a43014f21e',
  world84: '3cb3d6118b2798c89790a182d0d3eb69bd8f5bfb1cb87fcb997b0d50c2e433e2',
  world85: '87888cc6cd63b20a02967f9d839ca20781d453585baf41e482ad58f2cd0f5878',
  world86: '35e2f0bb2c14248083dd5514c52951015b85646d9d97ee207e4162684f4f1a2b',
  world87: 'b35a4d0ec7579023e6ba83ea894ceeba3bd65c26f22ea9a568e9de94eb7b4150',
  world88: 'b96b8ca4a994bf052081da4499f6b34d864bf8ceb03fd8c27aa981c03510747d',
  world89: 'c6bbe33551e8d6be470e63cb75cfa75dd9012ebe56dad189b7681f4a8d573067',
  world90: '7f109a2bc863ab36fe9517fad4c43300e4409839ad8036459024fd0db4e443aa',
  world91: '0a4606f6b2d934132adaf12ec9bb3eb28190c5b080c2946445c395a2c315bd10',
  world92: '4dbadc7abb0751cc241a86991bbc8c45df9379416fd5cd9b91ab3ef0524a9c79',
  world93: 'ff1fac557b7368668303860530b55780673c8fb33c8627b1b3a9fc1c39b98562',
  world94: '6f482bb81f3a49306cfe3b936e44f8b7bec72d0b09286d687b2b9e58cb9e16da',
  world95: '4c705e967ac2f039cb79517a3ad64e89404d2a15c0500f917e0b336f66e5a0a7',
  world96: 'cdbfcb6e2533c9e26a51157d1304564ff34ed5767f45586387faec285fea0bb4',
  world97: '1dca6ab13b44079c0ece4b6030f01b8712ee200b094f7d5b43c8459733dd581e',
  world98: '4c21e4ee8da1c7d5ab746460fb1af03b2effad202715510695213429b2da06e0',
  world99: '96eddfd9b86bc9d0ea0f8de4e20b1388016d1b7ce20a1b22df30618a0e0979ca',
  world100: '3d4faf9c32561ad7ee0f885f1241882e6339bef496237ef9e1981bfb6f5e2f8a',
  world101: '87bd108fea8894900fed4f93cdf0625bdb6b7a6ad5d4d6ab1ee52c56f37ceaac',
  world102: '86cb555c9161567c59d4de139ac5751faffa0cfaa980e3f5aeb9cd71ccd6e410',
  world103: 'c61c70b2522b7e1ca7f8d6aa9ba6580a04f7f3d27d740183a3ef536fea581d4e',
  world104: 'd0057aeb2b7a86e4ddcebf9155a97c113050aae958380c9900e7b0ca57f53cf7',
  world105: 'ccf2e3515e8ad49701a9209ca4c9fc0170608ebca7ed4128e90153da15d4ad9f',
  world106: 'c4250605e9bb5807dd2ce2639706d6a7084b75413bd5d02927ed4026e0aba449',
  world107: '863a3200eac3d43c18cb0c3f63d6fc5953ca4bfae8c0cc1a605e34c94d668158',
  world108: 'ac91d7ba5bdae045b1e7eaab4973e93c1c42034d3d4d79e677472da77de613e3',
  world109: 'f5fc90b081cb6a9c42d179cffa784f392d88609db53ffc00b3dc38d5a0e10822',
  world110: '2457e95dcb6a6828d555491cf2e1dcd003ed326385d0b4abacaba6cf352a3e43',
  world111: '81e4b53aa27af94cbb68fa0ad59d00b97dc5cca829eeebdb8351dded8e460f04',
  world112: '1b7a03480daa42b31075e73543bf584feb0dd3f6077f7f18d047643e422aa35e',
  world113: 'eecfa6f6c84dc3043d6a45ac865eaedecd430da622ffd929e3249ae9ded3ff5d',
  world114: 'c0f385ffb38eeb803600e2954a8271a60b07d39b52461abd10e3055fb005cca3',
  world115: '2521c978439525b742936f08f47b31e5c7470b3b041b34c9c3f341162c8d0fa8',
  world116: '6ce9024745567dd5c5a348a5d79fc77594ecc2edae604f80dedcf607498ca14c',
  world117: 'd99fb7124b444aae70727a23faa7e5039ca1055d6c01ed1b910ed8a7953bd2d3',
  world118: 'fc4e95b11a22fac5d621c8c14afab241430fab59c38af7ee75b8944fb50686bc',
  world119: '2f6da5b5c2b47bf72469c7d2a25a2664390333c68b0c92185b80a3c4bbeb94b4',
  world120: '57bde0d4703172bb01e5c0763c99bc69046c8bb997d5272af1e27860a1f79600',
  world121: 'c79d15c3268b7e86d24af71f4927226a83560b32d038ccc03ad70f40f84be81c',
  world122: '5058554d9eb26b5d3f72e6e63727ed1dd9183219eebd0074277af4be32aeb1fc',
  world123: 'f86ce4d41b5377e2e817a93cea03bde7c11638fc9e7ecb64c6b85324b90f7060',
  world124: '688d28caa14639887f2fc4841673b64d08437fe8c36658ad46fc64b5f233f6e0',
  world125: 'cbc33f03103e8fefb41e614a46f05e84ef2e2c2d1f9bbc5ba2683891caaa6780',
  world127: '5a0fc9bf0dd1b922ad58a116c83b53bf6786bd107db9b2dcf01ab3faa1b4b993',
  world128: '72771b06e7aa68f66e9e6ded44afc0d0e6abf5d916f4660cb5d08ba4ff389a39',
  world129: '2bd00ec1b4de557ab4e929f29d7dc1ffcc775768540abe1ac7c7c793227b6df7',
  world130: '331e2ee12ef353efc93f3f9e3852c971e55ebcea2bdacb6257416ec39de2b031',
  world131: '6632343e503000a370d9ad41ed7200dbaa7008a4a79be516ac2960a7fc368b21',
  world132: '0fff43b15bbdd2029a59bde1d167dbd9fc98e70ee9a6cce1d00565fe682053e7',
  world133: '451295ab26369e5f957d4cfbf607b5bbc129708708f86e6bff7685f2b29a3a17',
  world134: '65ddd6185143ec1d7b68c7bfc28ac8a916995afc5a982008a106f439b8987dba',
  world135: 'e97c6f1f8ccc64ed40f74c09523eec13dc3c79525a889b8244c9764d820a69f7',
  world136: '02e28acd44e1b2d8f17ce6f1be67c0ab27abd39e1ef7907f032595dc22907886',
  world137: '468c17ecf4c528704b811b455a2f084b5c7253c11399066143e523ec8808fff3',
  world138: '3c853a8baedf165665cbdcfe12d49255e563a4b117dfc905c1a8fb7416976fa1',
  world139: '78bc46cf9552f5c2682f696c28b2c17089f4bd497f74037ddc66f91bf93e3130',
  world140: '30e0446e5c8688beb96856d5eabd3f74470ec55321f3839ba4b3c1fa3791876c',
  world141: 'd5c8fb1bc23a00fff44b9896dfff9664dd3d368cc96c26d36871d0e68f46c22c',
  world142: '316e8828866d21a430f57ca5b6210d71dfe0e1f788a0bc589f129a903fd19c3e',
  world143: '961868021baaa075594f20095d27c215811f2e954cec4070bc3a8a240bf891b4',
  world144: 'fc5c47113fb6e558590cc9628add81ea51217c10dce679a2de60c5327431ab0a',
  world145: 'fe0fced3e54245647a13f5c90130519f665bd1c7f9b21437f69ec91510a3cece',
  world146: '9bc80fa0d9eb28adb1f312d72e1bfa2ffeaf4db5371ef028378053e2dd564a92',
  world147: 'cf2998d3029a2aab273b2a85f53cc0960e95551292954c2d2896a23f92a39498',
  world148: 'c12104312c35023af1706340d308001dbd431dccd1d4b52e691d0e9bb400a925',
  world149: '906b13a4a78fa2fbc9cfc8ac61f9d855a109b4ea0da9a4b69c4d01e206f066ff',
  world150: 'efa11e42e9f7e844a44a2d59696563dfcf4aae1fba05fa314350b0d884d3cbf7',
  world151: '4b99ff120252da795f1e9bd39767fae81bac6c2178200239b17aec1c65200bb4',
  world152: '33f7426cf1825923f1835f6680831c8d6f774911bde90819e2f1838ece427b6c',
  world153: 'd13c9374af68e0ef11e594a46719d66b5a0e6dc456c153b4ae1ae3fe0d610d15',
  world154: '95879e04edc7e68065eab5a1b56c73867af69551ff0beef3f167b9d519d99afe',
  world155: '6b83800453262217b974bbd2b7db1da51befc6115421090cfba76697783a18d5',
  world156: '7096ae48403764e6fb48c3ecf5dfe5343d95d5a243df58ef5ab15b0e5353ec4d',
};

/** The law's bytes as git stores them. A Windows checkout writes `\r\n` where the repo and the Linux deploy have `\n`,
 *  and the hash names that deploy, so a carriage return is dropped before it is counted. */
const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url)).filter((b) => b !== 0x0d);

test('SLAM8: RELAY_VERSION names exactly one relay law - change the worker or the wire without bumping it and this fails (mutants: the relay edited under a version already shipped, which is SLAM5 verbatim; a row rewritten in place, which relabels bytes that are already deployed)', () => {
  assert.deepEqual(RELAY_GRAPH, ['server/src/index.js', 'server/src/staffTeleport.js', 'src/net/staffCommands.js', 'src/net/relayCfg.js', 'src/net/staffTeleport.js', 'src/net/privateInterior.js', 'src/net/boatIdentity.js', 'src/net/instanceRoom.js', 'src/net/wire.js', 'src/net/staffEvent/staffEventLaw.js', 'src/net/hubShards.js', 'src/world/mat4.js', 'src/net/identityToken.js', 'src/net/guild/guildLaw.js', 'src/net/heraldryLaw.js', 'src/net/siege/siegeRef.js', 'src/net/houseLaw.js', 'src/net/homeLaw.js', 'src/net/nameFilter.js', 'src/net/dice.js', 'src/net/raid/raidLaw.js', 'src/net/superDungeon/sdMarks.js', 'src/net/arena/arenaLaw.js', 'src/net/gate/gateCourts.js', 'src/net/gate/gateMods.js', 'src/systems/textManager.js', 'src/net/appearanceLaw.js', 'src/systems/armorMaterials.js', 'server/src/staffFollow.js', 'src/net/staffFollow.js', 'server/src/relayScale.js', 'server/src/relay.js', 'server/src/staffMessage.js', 'server/src/cellNodes.js', 'src/net/cellTree.js', 'server/src/cellMoves.js', 'server/src/cellHandover.js', 'src/net/overworldLaw.js', 'src/net/gate/gateLaw.js', 'server/src/staffFreeze.js', 'server/src/staffHidden.js', 'src/net/hiddenSeen.js', 'server/src/staffEvents.js', 'src/net/staffEvent/staffEventReceipt.js', 'server/src/staffFeeds.js', 'server/src/staffFeedLaw.js', 'src/net/grantLaw.js', 'server/src/sdCopy.js', 'src/net/superDungeon/sdLaw.js', 'src/net/roomLease.js', 'src/net/gate/gateRite.js', 'src/net/siege/siegeReceipt.js', 'src/net/duel/duelRef.js', 'src/net/wild/wildRef.js', 'src/net/wild/wildReceipt.js', 'src/net/sea/seaRef.js', 'src/net/serpent/serpentBrain.js', 'src/net/serpent/serpentBody.js', 'src/net/serpent/serpentLaw.js', 'src/net/duel/duelReceipt.js', 'src/net/gate/gateBrain.js', 'src/net/gate/gateReceipt.js', 'src/net/bossBody.js', 'src/net/bossSeam.js', 'src/net/superDungeon/sdRemnant.js', 'src/net/superDungeon/sdBrain.js', 'src/net/bossRef.js', 'src/net/gate/gateStrike.js', 'src/world/segment.js', 'src/systems/serpent/serpentStrike.js', 'src/net/serpent/serpentReceipt.js', 'src/net/serpent/serpentHerald.js', 'src/net/gate/gateHerald.js', 'src/net/herald/heraldCard.js', 'src/net/raid/raidReceipt.js', 'src/net/starfall/starfallLaw.js', 'src/net/festivalLaw.js', 'src/systems/holidayTables.js', 'src/net/starfall/starReceipt.js', 'src/net/watchReceipt.js', 'src/net/arena/arenaExhibition.js', 'src/systems/wind/wind.js', 'src/net/arena/arenaBrain.js', 'src/systems/arena/arenaBout.js', 'src/net/duel/duelSession.js', 'src/ai/blowShapes.js', 'src/net/arena/arenaReceipt.js', 'src/net/safety/chatStamp.js', 'src/net/safety/chatFeed.js', 'server/src/drainWindows.js', 'src/net/grantMeasure.js', 'src/net/foeBounds.js', 'src/systems/skillSoftcap.js', 'src/systems/masterSkills.js', 'src/net/seatLive.js', 'server/src/foesHold.js', 'src/net/wild/wildLaw.js', 'src/net/superDungeon/sdHerald.js', 'src/formats/mapsTables.js', 'src/net/superDungeon/sdReceipt.js']);
  const h = createHash('sha256');
  for (const f of RELAY_GRAPH) h.update(rd(f));
  const hash = h.digest('hex');
  assert.ok(LAW[RELAY_VERSION], `RELAY_VERSION is '${RELAY_VERSION}' and this file has no law recorded for it - add the row`);
  assert.equal(hash, LAW[RELAY_VERSION],
    `THE RELAY'S LAW CHANGED UNDER '${RELAY_VERSION}'.\n`
    + `  Bump RELAY_VERSION in src/net/wire.js and add a row here in the SAME commit:\n`
    + `      ${'<new version>'}: '${hash}',\n`
    + `  /health is the only pre-flight check the event has, and it has to mean something.`);
  assert.equal(new Set(Object.values(LAW)).size, Object.keys(LAW).length, 'two versions cannot name the same bytes');
  assert.ok(/^world\d+$/.test(RELAY_VERSION), 'the shape law (nine test files hard-code this spelling)');
});
