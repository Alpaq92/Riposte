A PostScript unit test framework written in PostScript.


Example
=======

Code under test in file "readme-code.ps":

    /return-one 1 def
    /return-two 1 def

Test in file "readme-test.ps":

    (pstest.ps) runlibfile
    (readme-code.ps) run

    (Snippets for the Readme) test-case

    (return-one) should
    (return 1)
    return-one 1 assert-equal

    (return-two) should
    (return 2)
    return-two 2 assert-equal

    test-summary

Output in file "readme-expected.out":

    Snippets for the Readme
    .F
    --------------------------------------------------
    2 tests, 1 failed

    return-two
      should return 2
        expected: 2
        actual:   1


Definition
==========

Structure for code under test
-----------------------------

The code under test is a separate file that must run without side effects.
In particular, it should not make marks on the output device or modify
the stack in any way.

It should define a lot of procedures to exercise in the tests.

The procedures, when executed, could print debug messages.  They must
not leave anything on the stack that is not used up during the tests.

In addition you will want another PostScript program to later include
the no-side-effect module and actually do something useful with the
procedures defined.

Structure of a test case
------------------------

 * (pstest.ps) **runlibfile**
 * _filename-of-code-under-test_ **run**

Import the testing framework first, then the code under test.  Take
care not to redefine testing infrastructure accidentally.

 * _title_ **test-case** mark

A test is introduced by executing the procedure `test-case`. It reads
the title of the test case as a string and leaves a mark on the stack.

Assertions will leave all kinds of artifacts on the stack to describe
failed tests.

 * _item_ **should**

Group assertions as describing an item.

 * mark _any*_ **test-summary**

After the test, execute `test-summary`. This will print out all the
messages that have accumulated on the stack.

Test assertions
---------------

 * _spec value_ **assert-true** _any*_
 * _spec value_ **assert-false** _any*_

Pass if the _value_ is `true` or `false` respectively, fail otherwise.

 * _spec actual expected_ **assert-equal** _any*_
 * _spec actual expected_ **assert-not-equal** _any*_

Compares the two objects from the top of the stack.  If they are equal
or not equal, respectively, the test is passed.

Otherwise prepares information so that the result is easier to
interpret.

 * _spec actual expected_ **assert-deep-equal** _any*_

Compares two objects, descending recursively into arrays and dicts to
compare individual corresponding entries.  Also works for primitives.

 * _spec array_ **assert-empty** _any*_
 * _spec array_ **assert-not-empty** _any*_

Pass if the _array_ is empty or not empty, respectively.

 * _spec hay needle_ **assert-string-contains** _any*_
 * _spec hay needle_ **assert-not-string-contains** _any*_

Pass if the string _needle_ is contained or not contained,
respectively, in the string _hay_.

 * _spec array object_ **assert-contains** _any*_
 * _spec array object_ **assert-not-contains** _any*_

Pass if the _object_ is contained or not contained, respectively, in the
_array_.  Uses shallow search and only accepts objects of matching type.

 * _spec proc clean_ **assert-error** _any*_

Execute the _proc_ in a `stopped` context, expecting an error.  Pass
if the error is thrown, otherwise fail.

If any cleanup is needed after the test passes, e.g. removing debris
from the stack, put that into the procedure _clean_. This will only be
executed if the test passes.

If the test fails, execution still continues with the next test.  No
automatic cleanup is done though, and the output of the
**test-summary** is still likely to be garbage.

 * _spec actual expected epsilon_ **assert-almost-equal** _any*_
 * _spec actual expected epsilon_ **assert-not-almost-equal** _any*_

When comparing numbers, accept a difference of up to _epsilon_.

Note that the [reference
manual](https://www.adobe.com/products/postscript/pdfs/PLRM.pdf) does
not require more than IEEE 754 single precision, where the mantissa
has only 24 bits, so epsilons smaller than 1e-05 are not useful in
general.


 * _spec actual expected epsilon_ **assert-deep-almost-equal** _any*_
 * _spec actual expected epsilon_ **assert-deep-not-almost-equal** _any*_

Well yeah: deep and almost.

Caveats
=======

This is more of a plaything than a serious endeavour.

There is no special construct to actually test some paint in the
output device.

When an unexpected error occurs, the program just breaks off with
ghostscript's standard error handling.  In particular, no further
tests are executed. [#18](https://github.com/tylus/pstest/issues/18)

The diff of objects is not very useful yet. For example, arrays are
always shown in full; contents of dicts are not shown at all.
[#16](https://github.com/tylus/pstest/issues/16)

The test summary is fragile: If any garbage is left on the stack by
the tests or code under test (especially marks), it will likely
produce garbage.

While there is an assertion to test error handling in an application,
even here no automatic cleanup is done.

The tests for **almost-[not]-equal** are potentially fragile because
they depend on the actual floating point representation and output
formatting of the specific implementation of the PostScript language.
I have not made an attempt to fix that yet.
[#19](https://github.com/tylus/pstest/issues/19)


References
==========

Before you dig in here, know that [the Ghostscript project uses Python
unit tests](http://pages.cs.wisc.edu/~ghost/doc/AFPL/8.00/Testing.htm).

Otherwise my google-fu has deserted me.  I'm sure there must be dozens
of much more sophisticated PostScript unit test frameworks out there,
but I didn't find them.  While this is a fun project just to see
whether I can do it, if you know a better way, please let me know.

Ghostscript also has the only [coding
guidelines](http://www.ghostscript.com/doc/current/Ps-style.htm) of
which I am aware.  In this project, I have started to adopt that
style. Exceptions:

* I like `hyphenated-names` better than `camelCase` in PostScript.
* I don't put a copyright notice at the top of every file.
