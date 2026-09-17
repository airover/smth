const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStorage.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockStorage.delete(key);
  }),
}));

import {
  clearTopicReadingProgress,
  getTopicReadingProgress,
  saveTopicReadingProgress,
} from '../readingProgress';

describe('saveTopicReadingProgress', () => {
  beforeEach(async () => {
    mockStorage.clear();
    await clearTopicReadingProgress();
  });

  afterEach(async () => {
    await clearTopicReadingProgress();
  });

  it.each([undefined, null, ''])('topicOrder 为 %p 时回退到 position 比较', async topicOrder => {
    await saveTopicReadingProgress({
      topicId: 'topic',
      articleId: 'first',
      topicOrder: topicOrder as unknown as number,
      position: 0,
      page: 1,
    });
    await saveTopicReadingProgress({
      topicId: 'topic',
      articleId: 'second',
      topicOrder: topicOrder as unknown as number,
      position: 1,
      page: 1,
    });

    expect((await getTopicReadingProgress('topic'))?.articleId).toBe('second');
  });

  it('保留有效的 0 序号并继续按 topicOrder 前进', async () => {
    await saveTopicReadingProgress({
      topicId: 'topic', articleId: 'zero', topicOrder: 0, position: 5, page: 1,
    });
    await saveTopicReadingProgress({
      topicId: 'topic', articleId: 'one', topicOrder: 1, position: 0, page: 1,
    });

    expect((await getTopicReadingProgress('topic'))?.articleId).toBe('one');
  });

  it('不会用更小的有效序号覆盖最远阅读位置', async () => {
    await saveTopicReadingProgress({
      topicId: 'topic', articleId: 'later', topicOrder: 10, position: 10, page: 2,
    });
    await saveTopicReadingProgress({
      topicId: 'topic', articleId: 'earlier', topicOrder: 9, position: 20, page: 3,
    });

    expect((await getTopicReadingProgress('topic'))?.articleId).toBe('later');
  });
});
