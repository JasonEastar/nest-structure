import { zLatLng, zText } from './validation.js';

describe('zText', () => {
  it('trim, bỏ thẻ HTML, giới hạn độ dài', () => {
    expect(zText(20).parse('  <b>Minh</b> Trần ')).toBe('Minh Trần');
    expect(zText(20).parse('<script>alert(1)</script>ok')).toBe('alert(1)ok');
    expect(zText(5).safeParse('quá dài rồi').success).toBe(false);
  });

  it('rỗng sau khi strip → không hợp lệ (min 1)', () => {
    expect(zText(20).safeParse('<br/>').success).toBe(false);
    expect(zText(20).safeParse('   ').success).toBe(false);
    expect(zText(20, 0).parse('<br/>')).toBe('');
  });
});

describe('zLatLng', () => {
  it('trong phạm vi WGS84', () => {
    expect(zLatLng.parse({ lat: 10.78, lng: 106.7 })).toEqual({ lat: 10.78, lng: 106.7 });
    expect(zLatLng.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
    expect(zLatLng.safeParse({ lat: 0, lng: -181 }).success).toBe(false);
  });
});
