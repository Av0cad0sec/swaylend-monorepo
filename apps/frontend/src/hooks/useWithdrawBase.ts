import {
  ErrorToast,
  PendingToast,
  TransactionSuccessToast,
} from '@/components/Toasts';
import { appConfig } from '@/configs';
import type { PriceDataUpdateInput } from '@/contract-types/Market';
import { useMarketContract } from '@/contracts/useMarketContract';
import { usePythContract } from '@/contracts/usePythContract';
import {
  selectChangeInputDialogOpen,
  selectChangeSuccessDialogOpen,
  selectChangeSuccessDialogTransactionId,
  selectChangeTokenAmount,
  selectMarket,
  useMarketStore,
} from '@/stores';
import { useAccount } from '@fuels/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { toast } from 'react-toastify';
import { useMarketConfiguration } from './useMarketConfiguration';

export const useWithdrawBase = () => {
  const { account } = useAccount();
  const market = useMarketStore(selectMarket);
  const changeTokenAmount = useMarketStore(selectChangeTokenAmount);
  const changeInputDialogOpen = useMarketStore(selectChangeInputDialogOpen);
  const changeSuccessDialogOpen = useMarketStore(selectChangeSuccessDialogOpen);
  const changeSuccessDialogTransactionId = useMarketStore(
    selectChangeSuccessDialogTransactionId
  );
  const { data: marketConfiguration } = useMarketConfiguration();

  const queryClient = useQueryClient();
  const marketContract = useMarketContract(market);
  const pythContract = usePythContract(market);

  return useMutation({
    mutationKey: [
      'withdrawBase',
      account,
      marketConfiguration,
      marketContract?.account?.address,
      marketContract?.id,
      pythContract?.account?.address,
      pythContract?.id,
    ],
    mutationFn: async ({
      tokenAmount,
      priceUpdateData,
    }: {
      tokenAmount: BigNumber;
      priceUpdateData: PriceDataUpdateInput;
    }) => {
      if (
        !account ||
        !marketConfiguration ||
        !marketContract ||
        !pythContract
      ) {
        return null;
      }

      const amount = new BigNumber(tokenAmount).times(
        10 ** marketConfiguration.baseTokenDecimals
      );

      const { waitForResult } = await marketContract.functions
        .withdraw_base(amount.toFixed(0), priceUpdateData)
        .callParams({
          forward: {
            amount: priceUpdateData.update_fee,
            assetId: appConfig.baseAssetId,
          },
        })
        .addContracts([pythContract])
        .call();

      const transactionResult = await toast.promise(waitForResult(), {
        pending: {
          render: PendingToast(),
        },
      });

      return transactionResult.transactionId;
    },
    onSuccess: (data) => {
      if (data) {
        TransactionSuccessToast({ transactionId: data });
        changeSuccessDialogTransactionId(data);
        changeInputDialogOpen(false);
        changeTokenAmount(BigNumber(0));
        changeSuccessDialogOpen(true);
      }
    },
    onError: (error) => {
      ErrorToast({ error: error.message });
    },
    onSettled: () => {
      // Invalidate queries
      queryClient.invalidateQueries({
        queryKey: [
          'userSupplyBorrow',
          account,
          marketContract?.account?.address,
          marketContract?.id,
        ],
      });

      // Invalidate Fuel balance query
      queryClient.invalidateQueries({
        exact: true,
        queryKey: ['balance', account, marketConfiguration?.baseToken.bits],
      });
    },
  });
};
