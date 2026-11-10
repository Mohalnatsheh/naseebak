import 'package:flutter/widgets.dart';

/// Fades [child] without an opacity layer (QA A-L10).
///
/// An `Opacity` / `FadeTransition` between 0 and 1 hands its opacity down to the child's drawing, and on this
/// engine Impeller logs «SetInheritedOpacity should never be called…» for every such frame (text, blurred shadows,
/// the logo). Scaling the alpha with a colour filter draws the child into its own layer instead, so nothing is
/// inherited: the same picture, no warning. At full opacity the filter goes away and the child keeps its state (a
/// global key carries the subtree across, so a text field in an entrance never loses focus or its text).
class AlphaFade extends StatefulWidget {
  const AlphaFade({super.key, required this.opacity, required this.child});

  /// 0 (hidden) to 1 (as is)
  final double opacity;
  final Widget child;

  /// The colour matrix that multiplies alpha by [opacity] and leaves the colours as they are
  static ColorFilter filterFor(double opacity) => ColorFilter.matrix(<double>[
        1, 0, 0, 0, 0, //
        0, 1, 0, 0, 0, //
        0, 0, 1, 0, 0, //
        0, 0, 0, opacity.clamp(0.0, 1.0), 0,
      ]);

  @override
  State<AlphaFade> createState() => _AlphaFadeState();
}

class _AlphaFadeState extends State<AlphaFade> {
  final _subtree = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final child = KeyedSubtree(key: _subtree, child: widget.child);
    if (widget.opacity >= 1) return child;
    return ColorFiltered(colorFilter: AlphaFade.filterFor(widget.opacity), child: child);
  }
}
