import { newPoolCreatedMock, poolFeeSetMock } from './utils';
import prisma from '../../client';
import newPoolCreated from '../newPoolCreated';
import poolFeeSet from '../poolFeeSet';

describe(newPoolCreated, () => {
  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "Pool" CASCADE`;
  });

  it('updates the pool fee correctly', async () => {
    const { block: newPoolBlock, event: newPoolEvent } = newPoolCreatedMock;

    await prisma.$transaction((tx) =>
      newPoolCreated({
        block: newPoolBlock as any,
        event: newPoolEvent as any,
        prisma: tx,
      }),
    );
    const pool = await prisma.pool.findFirstOrThrow();

    expect(pool).toMatchSnapshot({
      id: expect.any(Number),
    });

    const { block: poolFeeSetBlock, event: poolFeeSetEvent } = poolFeeSetMock;

    await prisma.$transaction((tx) =>
      poolFeeSet({
        block: poolFeeSetBlock as any,
        event: poolFeeSetEvent as any,
        prisma: tx,
      }),
    );

    const pool2 = await prisma.pool.findFirstOrThrow();

    expect(pool2).toMatchSnapshot({
      id: expect.any(Number),
    });
  });
});
