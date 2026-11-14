import 'package:flutter/material.dart';

import '../../core/localization/digits.dart';
import '../../core/theme/app_theme.dart';
import 'credits_repository.dart';

/// The sale offer (Admin → Settings → «Sale offer»): its title, the gift share and its last day, on «الرصيد» and on
/// «عضوية Pro» (the website's `OfferBanner`; `pro` says the gift comes with the first payment only).
class SaleOfferBanner extends StatelessWidget {
  const SaleOfferBanner({super.key, required this.offer, this.pro = false});
  final CreditOffer offer;
  final bool pro;

  @override
  Widget build(BuildContext context) {
    final title = offer.title.trim().isEmpty ? 'عرض لفترة محدودة' : offer.title.trim();
    // An offer ending exactly at midnight ends the day before (website: `endsAt - 1`)
    final lastDay = formatDate(offer.endsAt.subtract(const Duration(milliseconds: 1)), withYear: false);
    final line = pro
        ? 'رصيد إضافي بنسبة ${offer.percent}% عند أول دفعة اشتراك في Pro · حتى $lastDay'
        : '${offer.percent}% رصيد هدية مع كل باقة · حتى $lastDay';
    return Container(
      key: Key(pro ? 'pro-offer-banner' : 'offer-banner'),
      padding: const EdgeInsets.all(AppSpace.lg),
      decoration: BoxDecoration(color: AppColors.goldSoft, borderRadius: BorderRadius.circular(AppRadius.md)),
      child: Row(
        children: [
          const Icon(Icons.local_offer_outlined, color: AppColors.goldText),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.label.copyWith(color: AppColors.ink, fontWeight: FontWeight.w800)),
                Text(line, style: AppText.caption.copyWith(color: AppColors.goldText)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
