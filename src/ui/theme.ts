export const FONT_FAMILY =
  '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Heiti TC", system-ui, sans-serif';

export const COLORS = {
  ink: 0x2d1b00,
  inkCss: '#2d1b00',
  cream: 0xfff6dc,
  yellow: 0xf5c400,
  yellowLight: 0xffe066,
  orange: 0xff8c1a,
  red: 0xe63946,
  green: 0x2a9d8f,
  ironGreen: 0x3f7d4f,
  blue: 0x3d7ae0,
  sky: 0x9ed8f5,
  white: 0xffffff,
  grey: 0x8a8f98,
  tileBeige: 0xe9dcb8,
  tileLine: 0xd2c29a,
} as const;

export const TEXT = {
  title: { fontFamily: FONT_FAMILY, fontSize: '84px', fontStyle: '900', color: '#2d1b00', stroke: '#ffffff', strokeThickness: 12 },
  h2: { fontFamily: FONT_FAMILY, fontSize: '44px', fontStyle: '900', color: '#2d1b00', stroke: '#ffffff', strokeThickness: 8 },
  body: { fontFamily: FONT_FAMILY, fontSize: '30px', fontStyle: '700', color: '#2d1b00' },
  small: { fontFamily: FONT_FAMILY, fontSize: '22px', fontStyle: '600', color: '#2d1b00' },
  hud: { fontFamily: FONT_FAMILY, fontSize: '30px', fontStyle: '900', color: '#ffffff', stroke: '#2d1b00', strokeThickness: 6 },
} as const;
