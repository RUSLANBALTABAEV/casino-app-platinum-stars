import { redirect } from 'next/navigation';

// /nft → /inventory (NFT-магазин реализован на странице inventory)
export default function NftPage() {
  redirect('/inventory');
}
