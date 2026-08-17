export function hasActiveSubscription(user) {
  return Boolean(
    user.subscription.plan !== 'free' &&
      user.subscription.isActive &&
      user.subscription.endDate &&
      user.subscription.endDate > new Date()
  )
}
