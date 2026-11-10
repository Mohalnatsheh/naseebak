import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// The chat's soft backdrop: warm sand with a light brand pattern (eight-point stars, small rhombi and dots in navy
/// at 4%, design P2-1), drawn in code — no image, no faces. It sits in its own [RepaintBoundary], so scrolling the messages over
/// it never repaints it.
class ChatBackground extends StatelessWidget {
  const ChatBackground({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        const RepaintBoundary(
          child: CustomPaint(
            key: Key('chat-background'),
            painter: ChatPatternPainter(),
            isComplex: true,
          ),
        ),
        child,
      ],
    );
  }
}

class ChatPatternPainter extends CustomPainter {
  const ChatPatternPainter();

  /// One tile of the pattern; rows are offset by half a tile
  static const tile = 88.0;

  @override
  void paint(Canvas canvas, Size size) {
    // Once per size (its own layer): the tiles run past the edges, so keep them inside
    canvas.clipRect(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, Paint()..color = AppColors.chatBackdrop);
    final stroke = Paint()
      ..color = AppColors.navy.withValues(alpha: 0.04)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1;
    final fill = Paint()..color = AppColors.navy.withValues(alpha: 0.04);
    // Navy only, as the design says (navy at 4–6% on off-white)
    final rhombi = Paint()
      ..color = AppColors.navy.withValues(alpha: 0.04)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1;
    final star = _star(9);
    final rhombus = Path()
      ..moveTo(0, -6)
      ..lineTo(4, 0)
      ..lineTo(0, 6)
      ..lineTo(-4, 0)
      ..close();
    var row = 0;
    for (var y = -tile / 2; y < size.height + tile; y += tile / 2, row++) {
      final shift = row.isOdd ? tile / 2 : 0.0;
      for (var x = -tile + shift; x < size.width + tile; x += tile) {
        if (row.isEven) {
          canvas.save();
          canvas.translate(x, y);
          canvas.drawPath(star, stroke);
          canvas.restore();
        } else {
          canvas.save();
          canvas.translate(x, y);
          canvas.drawPath(rhombus, rhombi);
          canvas.restore();
        }
        canvas.drawCircle(Offset(x + tile / 4, y + tile / 8), 1.4, fill);
      }
    }
  }

  /// An eight-point star (two squares turned 45° apart), centred on 0,0
  static Path _star(double r) {
    final p = Path();
    for (final turn in [0.0, math.pi / 4]) {
      for (var k = 0; k < 4; k++) {
        final a = turn + k * math.pi / 2;
        final o = Offset(r * math.cos(a), r * math.sin(a));
        k == 0 ? p.moveTo(o.dx, o.dy) : p.lineTo(o.dx, o.dy);
      }
      p.close();
    }
    return p;
  }

  @override
  bool shouldRepaint(ChatPatternPainter oldDelegate) => false;
}
