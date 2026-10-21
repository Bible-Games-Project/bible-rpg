"""Master palette and finishing passes for every sprite in the game.

The core ramps (skin, hair, leaf) were sampled from the supplied references
(art/reference/adam-sprite.webp and adam-talk.webp). The other ramps were
built to match them: same number of steps, same hue shift (warmer lights,
cooler/redder darks) and the same saturation range.
"""

from __future__ import annotations

import numpy as np

import pixel as px


def ramp(*hexes: str):
    return [px.hexc(h) for h in hexes]


P = {
    # sampled from the references
    'skin': ramp('#64281c', '#793422', '#8c4028', '#a64c2f', '#ba5a39', '#ca6740', '#d67348', '#e18051', '#e88b59', '#ed9560', '#f29c66', '#f7a66e', '#fbba81'),
    'hair': ramp('#1d0c11', '#241014', '#2f1517', '#3c1c19', '#48211a', '#54271d', '#613222', '#763a25', '#8a4a30', '#a05a38'),
    'leaf': ramp('#0a1f10', '#0f2713', '#142e14', '#1b3716', '#274519', '#38581c', '#4c6d1d', '#688923', '#84a52d'),
    'eye': ramp('#d4cac4', '#f2ece6'),
    # built to match
    'skin_eve': ramp('#6a2b20', '#803827', '#94452e', '#ad5436', '#c0623f', '#cf7048', '#da7d51', '#e38a5b', '#ea9563', '#efa06b', '#f4aa74', '#f8b77f', '#fcc791'),
    'hair_eve': ramp('#170a0d', '#1f0d10', '#2a1213', '#361816', '#431e18', '#4f241b', '#5c2c1f', '#6d3624', '#80432c', '#955234'),
    'lips': ramp('#7a2a24', '#9a3a30', '#b5493b', '#c95a48'),
    'fig': ramp('#06180e', '#0b2414', '#11301a', '#183f20', '#235026', '#30632b', '#41782f', '#578f36', '#73a83f'),
    'leaf_dark': ramp('#071710', '#0b1f14', '#102a18', '#16361c', '#1f4420', '#2b5425', '#3a6629', '#4f7a2d', '#689033'),
    'leaf_blue': ramp('#08181a', '#0c2121', '#112c28', '#17392f', '#1f4836', '#2a593e', '#386b45', '#4b7f4c', '#649454'),
    'olive': ramp('#151e16', '#1c281d', '#253425', '#30422e', '#3d5139', '#4c6145', '#5e7353', '#728563', '#8a9a77'),
    'bark': ramp('#160c0b', '#21120f', '#2e1a13', '#3c2317', '#4b2d1c', '#5c3923', '#6e462b', '#825535', '#966641', '#ab7a50'),
    'bark_grey': ramp('#15130f', '#1f1c17', '#2a261f', '#36312a', '#433d34', '#524a40', '#62594d', '#746a5c', '#877d6d', '#9b917f'),
    'earth': ramp('#21140e', '#2e1c13', '#3d2618', '#4d311e', '#5e3d25', '#70492c', '#825635', '#96653f', '#a9764b', '#bb8858'),
    'soil': ramp('#1a0f0b', '#24150f', '#301c13', '#3d2418', '#4b2c1d', '#5a3523', '#6a3f29'),
    'sand': ramp('#5e4328', '#735333', '#89643e', '#9e754a', '#b38757', '#c69a66', '#d5ad7a', '#e2c08f', '#eed3a7'),
    'grass': ramp('#0e2412', '#153017', '#1d3c1a', '#27491d', '#325620', '#3e6424', '#4b7228', '#5a802d', '#6a8e33', '#7d9c3b'),
    'water': ramp('#0b1626', '#0f1f35', '#142a45', '#1a3756', '#214667', '#2a5677', '#356886', '#447b95', '#5a91a5', '#79aab7', '#a4c9cf', '#d4e9e8'),
    'stone': ramp('#14151a', '#1d1f25', '#272a31', '#33363d', '#40434a', '#4e5157', '#5e6066', '#6f7176', '#828387', '#96969a', '#ababad', '#c1c0bf'),
    'stone_warm': ramp('#1a1411', '#251d18', '#31271f', '#3e3228', '#4c3e32', '#5b4b3d', '#6b5948', '#7c6854', '#8e7962', '#a18b72', '#b49e86'),
    'ivory': ramp('#3d3328', '#544737', '#6b5c48', '#83725b', '#9b8a71', '#b3a288', '#c9b99f', '#dccdb4', '#ebdfc8', '#f5ecd9', '#fbf6ea', '#ffffff'),
    'gold': ramp('#3a220c', '#523110', '#6b4214', '#87551a', '#a46a22', '#bf802c', '#d69837', '#e8b45b', '#f2c97a', '#f9dd9f', '#fdeec8'),
    'tunic': ramp('#1f140d', '#2b1c12', '#382618', '#46301e', '#553b24', '#64472b', '#755433', '#86623d', '#987148', '#aa8156', '#bb9265'),
    'rope': ramp('#3a2a17', '#55401f', '#725828', '#8e7033', '#a98a45', '#c2a35c'),
    'wool': ramp('#2e2822', '#423a32', '#585045', '#6f675a', '#877f71', '#9f978a', '#b7b0a3', '#ccc6ba', '#ded9cf', '#ece8e0', '#f7f5f0'),
    'goat': ramp('#170f0b', '#231711', '#302018', '#3e2a1f', '#4d3526', '#5d412e', '#6e4e37', '#805d42', '#936d4f', '#a67f5f', '#b99372'),
    'deer': ramp('#25110a', '#341a0e', '#452413', '#572f18', '#6a3b1e', '#7d4824', '#90562b', '#a36634', '#b5773f', '#c6894d', '#d59b5e'),
    'lion': ramp('#2d1a0c', '#3f2611', '#523316', '#66401c', '#7b4e23', '#8f5d2b', '#a36d35', '#b67e41', '#c6904f', '#d4a262', '#e0b577'),
    'mane': ramp('#160b07', '#20100a', '#2c160d', '#391c10', '#462313', '#552b17', '#64341c', '#753e22', '#874a29'),
    'rabbit': ramp('#231c18', '#30271f', '#3f3329', '#4f4134', '#605040', '#72614f', '#85735f', '#988670', '#ab9a85', '#bfaf9b', '#d2c4b1'),
    'horse': ramp('#140a07', '#1d0f0a', '#28150d', '#341b11', '#412215', '#4f2a1a', '#5e3320', '#6e3d26', '#7f482d', '#915535', '#a3633f'),
    'camel': ramp('#2f2213', '#3f2e1a', '#4f3a21', '#604729', '#715532', '#83643c', '#957447', '#a68453', '#b69560', '#c4a56f', '#d2b680'),
    'dove': ramp('#232429', '#2f3037', '#3d3e46', '#4c4d56', '#5d5e67', '#6f7079', '#82838b', '#96969d', '#aaaaaf', '#bebec1', '#d2d1d2', '#e6e4e2', '#f6f4f0'),
    'serpent': ramp('#071209', '#0b1a0d', '#102411', '#162f15', '#1e3c19', '#284a1c', '#335a20', '#3f6b24', '#4e7d29', '#5f8f2f', '#73a036'),
    'belly': ramp('#3a3216', '#4f441d', '#665825', '#7d6d2f', '#94823b', '#a99748', '#bcab58', '#cdbe6c'),
    'horn': ramp('#2a2620', '#3d372e', '#524a3e', '#685e4f', '#7f7361', '#968875', '#ac9e8a'),
    'hoof': ramp('#120d0b', '#1d1612', '#2a201a', '#382b23'),
    'nose': ramp('#2a1416', '#3f1d1f', '#57282a', '#6f3535'),
    'pink': ramp('#5e2a2c', '#7d3a3a', '#9c4d4a', '#b9625c', '#d07b72', '#e2968a'),
    'fig_fruit': ramp('#160b16', '#211021', '#2e1630', '#3d1d40', '#4d2651', '#5f3263', '#734175', '#885388'),
    'pomegranate': ramp('#240708', '#36090b', '#4b0d0f', '#621314', '#7a1a18', '#93231d', '#ab2f22', '#c13f2a', '#d35536', '#e27047'),
    'date': ramp('#240f06', '#341709', '#46200c', '#592b10', '#6d3715', '#82441a', '#975321', '#ab632a', '#bd7535'),
    'grape': ramp('#0f0a19', '#171024', '#211731', '#2c1f40', '#38284f', '#46325f', '#553e70', '#664c81', '#795d92'),
    'forbidden': ramp('#2a0705', '#3d0c07', '#530f09', '#6b150b', '#841c0d', '#9d2610', '#b43414', '#c8461a', '#d85c22', '#e5772f', '#eea044', '#f5c866'),
    'flower_white': ramp('#5b5650', '#807a71', '#a49d92', '#c7c0b3', '#e3ddd0', '#f6f2e8'),
    'flower_yellow': ramp('#5a3f0c', '#7f5b10', '#a57a16', '#c69a1f', '#e0b833', '#f0d258'),
    'flower_red': ramp('#3c0e10', '#5c1517', '#7f1f20', '#a12c2a', '#c03f37', '#d65b4d'),
    'flower_blue': ramp('#1d1b3c', '#2a285a', '#3a3a7c', '#4f519c', '#6b6eb8', '#8e92cf'),
    'flower_purple': ramp('#2a1430', '#3d1d46', '#53285e', '#6a3577', '#82468f', '#9c5ca6'),
    'flower_pink': ramp('#4d1e2a', '#6c2a3a', '#8d3a4c', '#ad4f60', '#c86a78', '#de8c96'),
    'flame': ramp('#3a0a04', '#5e1406', '#86200a', '#ac320e', '#cc4814', '#e3651d', '#f08a2c', '#f7b042', '#fcd36a', '#fff0b0'),
    'shadow': ramp('#0a160d'),
}


def snap(img: np.ndarray, *ramps: str) -> np.ndarray:
    pal = []
    for r in ramps:
        pal += P[r]
    return px.map_to_palette(img, pal)


def denoise(img: np.ndarray, passes: int = 1) -> np.ndarray:
    """Remove isolated pixels: a pixel whose 4 neighbours all differ from it,
    while at least 3 of them agree, takes that majority colour. Keeps the
    clusters clean and the edges deliberate."""
    out = img.copy()
    h, w = img.shape[:2]
    for _ in range(passes):
        src = out.copy()
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if src[y, x, 3] == 0:
                    continue
                c = tuple(src[y, x])
                nb = [tuple(src[y - 1, x]), tuple(src[y + 1, x]), tuple(src[y, x - 1]), tuple(src[y, x + 1])]
                if c in nb:
                    continue
                best = max(set(nb), key=nb.count)
                if nb.count(best) >= 3 and best[3] == 255:
                    out[y, x] = best
    return out


def light_index(rmp, c) -> int:
    lk = px.ramp_lookup(rmp)
    return lk.get(tuple(int(v) for v in c[:3]), -1)
