export enum WithdrawalType {
  STARS = 'STARS',
  NFT_GIFT = 'NFT_GIFT'
}

export enum WithdrawalCurrency {
  USD = 'USD',
  XTR = 'XTR',
  STARS = 'STARS',
  EUR = 'EUR',
  // добавь нужные валюты
}

export enum WithdrawalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SENT = 'SENT',
}
