import { describe, it, expect } from 'vitest';
import { httpUrlOrNull, youtubeEmbedUrl } from '../src/safeUrl';

describe('httpUrlOrNull', () => {
  it('keeps http(s) links and drops everything else', () => {
    expect(httpUrlOrNull(' https://youtube.com/watch?v=x ')).toBe('https://youtube.com/watch?v=x');
    expect(httpUrlOrNull('javascript:alert(1)')).toBeNull();
    expect(httpUrlOrNull('youtube.com/watch?v=x')).toBeNull();
    expect(httpUrlOrNull(42)).toBeNull();
  });
});

describe('youtubeEmbedUrl', () => {
  const embed = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';

  it('turns the usual YouTube link shapes into a privacy-enhanced embed', () => {
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe(embed);
    expect(youtubeEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(embed);
  });

  it('carries the start time over', () => {
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(`${embed}?start=90`);
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')).toBe(`${embed}?start=90`);
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s')).toBe(`${embed}?start=3723`);
  });

  it('returns null for anything that is not a single YouTube video', () => {
    expect(youtubeEmbedUrl(null)).toBeNull();
    expect(youtubeEmbedUrl('javascript:alert(1)')).toBeNull();
    expect(youtubeEmbedUrl('https://vimeo.com/123456')).toBeNull();
    expect(youtubeEmbedUrl('https://www.youtube.com/playlist?list=PL123')).toBeNull();
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=curto')).toBeNull();
    expect(youtubeEmbedUrl('https://evil.com/?v=dQw4w9WgXcQ&host=youtube.com')).toBeNull();
    expect(youtubeEmbedUrl('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});
