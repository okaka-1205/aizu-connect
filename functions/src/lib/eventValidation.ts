export const hasRequiredCommerceDisclosure = (
  eventData: FirebaseFirestore.DocumentData,
) =>
  eventData.feeType !== "有料" ||
  (Number(eventData.feeAmount ?? 0) > 0 &&
    [
      eventData.commercialSellerName,
      eventData.commercialSellerAddress,
      eventData.commercialSellerPhone,
      eventData.commercialResponsiblePerson,
      eventData.paymentMethod,
      eventData.paymentTiming,
      eventData.additionalFees,
      eventData.cancellationPolicy,
    ].every((value) => typeof value === "string" && value.trim()));
