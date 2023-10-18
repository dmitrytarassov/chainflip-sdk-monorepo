import { z } from 'zod';
import { getMinimumDepositAmount } from '@/shared/consts';
import { ChainflipNetwork } from '@/shared/enums';
import * as broker from '@/shared/node-apis/broker';
import { openSwapDepositChannelSchema } from '@/shared/schemas';
import { validateAddress } from '@/shared/validation/addressValidation';
import prisma from '../client';
import { isProduction } from '../utils/consts';
import ServiceError from '../utils/ServiceError';

export default async function openSwapDepositChannel({
  broker: brokerConfig,
  ...input
}: z.output<typeof openSwapDepositChannelSchema>) {
  if (!validateAddress(input.destAsset, input.destAddress, isProduction)) {
    throw ServiceError.badRequest('provided address is not valid');
  }

  const minimumAmount = getMinimumDepositAmount(
    process.env.CHAINFLIP_NETWORK as ChainflipNetwork,
    input.srcAsset,
  );
  if (BigInt(input.expectedDepositAmount) < BigInt(minimumAmount)) {
    throw ServiceError.badRequest(
      'expected amount is below minimum deposit amount',
    );
  }

  const {
    address: depositAddress,
    sourceChainExpiryBlock,
    ...blockInfo
  } = await broker.requestSwapDepositAddress(input, brokerConfig);

  const { destChain, ...rest } = input;
  const {
    issuedBlock,
    srcChain,
    channelId,
    depositAddress: channelDepositAddress,
  } = await prisma.swapDepositChannel.upsert({
    where: {
      issuedBlock_srcChain_channelId: {
        channelId: blockInfo.channelId,
        issuedBlock: blockInfo.issuedBlock,
        srcChain: input.srcChain,
      },
    },
    create: {
      ...rest,
      depositAddress,
      ...blockInfo,
    },
    update: {},
  });

  return {
    id: `${issuedBlock}-${srcChain}-${channelId}`,
    depositAddress: channelDepositAddress,
    issuedBlock,
    sourceChainExpiryBlock,
  };
}
